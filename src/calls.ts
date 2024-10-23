import type { PickLogger } from "./build.ts";
import type { Range } from "./picks.ts";
import type { Pickable } from "./pickable.ts";
import type { Edit, GroupEdit, MultiEdit } from "./edits.ts";

import { assert } from "@std/assert";
import { Filtered, type PickFunctionOpts } from "@/arbitrary.ts";
import { filtered } from "./results.ts";
import { PickBuffer, PickRequest, PickView } from "./picks.ts";
import { Script } from "./script_class.ts";
import { makePickFunction } from "./build.ts";
import { EditResponder, keep, removeGroup, snip } from "./edits.ts";

export const regen = Symbol("regen");

export type Call<T> = {
  readonly arg: Range | Script<T>;
  readonly val: T | typeof regen;
  readonly picks: PickView;
};

type Props = {
  readonly args: (Range | Script<unknown>)[];
  readonly vals: unknown[];
  readonly picks: PickView[];
};

export class CallBuffer implements PickLogger {
  private props: Props = {
    args: [],
    vals: [],
    picks: [],
  };

  #buf = new PickBuffer();

  #before: Iterator<Call<unknown>>;
  #changed = false;

  constructor(readonly origin?: CallLog) {
    this.#before = origin?.calls ?? [][Symbol.iterator]();
  }

  get complete(): boolean {
    return this.#buf.pushCount === 0;
  }

  /** Returns the number of calls recorded. */
  get length(): number {
    return this.props.args.length;
  }

  /** Returns true if the recorded log is different from the origin. */
  get changed(): boolean {
    return this.#changed || !this.complete ||
      this.length !== this.origin?.length;
  }

  reset() {
    this.props = {
      args: [],
      vals: [],
      picks: [],
    };
    this.#buf = new PickBuffer();
  }

  setChanged() {
    // TODO: compare picks as they're added?
    this.#changed = true;
  }

  push(req: Range, reply: number): void {
    this.#buf.push(req, reply);
  }

  undoPushes(removeCount: number): void {
    this.#buf.undoPushes(removeCount);
  }

  endPick(req: Range, reply: number): void {
    assert(this.complete);
    this.#buf.push(req, reply);
    this.endCall(req, reply, this.#buf.takeView());

    const next = this.#before.next();
    if (next.done || next.value.arg !== req || next.value.val !== reply) {
      this.#changed = true;
    }
  }

  endScript<T>(arg: Script<T>, val: T): void {
    const shouldCache = arg.cachable && Object.isFrozen(val);
    const storedVal = shouldCache ? val : regen;
    const picks = this.#buf.takeView();
    this.endCall(arg, storedVal, picks);

    const next = this.#before.next();
    if (next.done || next.value.arg !== arg || next.value.val !== storedVal) {
      this.#changed = true;
    }
  }

  /** Preserves a call from the original log. */
  keep(): void {
    assert(this.complete);

    const next = this.#before.next();
    assert(!next.done);
    const { arg, val, picks } = next.value;
    this.#buf.pushAll(picks.reqs, picks.replies);
    this.endCall(arg, val, this.#buf.takeView());
  }

  /**
   * Skips a call from the original log.
   *
   * This is so that {@link keep} will use the next call.
   */
  skipOriginal(): void {
    assert(this.complete);
    this.#before.next();
    this.#changed = true;
  }

  takeLog(): CallLog {
    assert(this.complete);
    const log = new CallLog(this.props);
    this.reset();
    return log;
  }

  private endCall<T>(
    arg: Range | Script<T>,
    val: T | typeof regen,
    view: PickView,
  ): void {
    const { args, vals, picks } = this.props;

    args.push(arg);
    vals.push(val);
    picks.push(view);
  }
}

/**
 * The calls that were made to a pick function.
 */
export class CallLog {
  constructor(private readonly props: Props) {}

  get length(): number {
    return this.props.args.length;
  }

  get replies(): Iterable<number> {
    function* generate(picks: PickView[]): Iterable<number> {
      for (const view of picks) {
        yield* view.replies;
      }
    }
    return generate(this.props.picks);
  }

  picksAt(offset: number): PickView {
    assert(offset >= 0);

    if (offset >= this.length) {
      return PickView.empty;
    }

    return this.props.picks[offset];
  }

  firstReplyAt(index: number, defaultReply: number): number {
    assert(index >= 0);

    if (index >= this.length) {
      return defaultReply;
    }

    const view = this.props.picks[index];
    assert(view.length > 0);
    return view.replyAt(0);
  }

  callAt(index: number): Call<unknown> {
    const { args, vals } = this.props;
    const arg = args[index];
    const val = vals[index];
    const picks = this.picksAt(index);
    return { arg, val, picks };
  }

  get calls(): IterableIterator<Call<unknown>> {
    function* generateCalls(log: CallLog): IterableIterator<Call<unknown>> {
      const len = log.length;
      for (let i = 0; i < len; i++) {
        yield log.callAt(i);
      }
    }
    return generateCalls(this);
  }

  /**
   * Builds a pickable using this log.
   */
  rebuild<T>(target: Pickable<T>): T | typeof filtered {
    try {
      return target.buildFrom(makePickFunctionWithEdits(this, () => keep));
    } catch (e) {
      if (e instanceof Filtered) {
        return filtered;
      }
      throw e;
    }
  }

  /**
   * Builds a script using this log after applying the given edits.
   */
  tryEdit<T>(
    target: Script<T>,
    edits: MultiEdit,
    log: CallBuffer,
  ): T | typeof filtered {
    if (!target.splitCalls) {
      // only record the top-level call.
      let edit = edits(0);
      if (edit === removeGroup) {
        edit = snip;
      }
      const picks = new EditResponder(this.replies, edit);
      const pick = makePickFunction(picks, { log });
      const val = target.build(pick);
      log?.endScript(target, val);
      if (picks.edited) {
        log?.setChanged();
      }
      return val;
    }

    const pick = makePickFunctionWithEdits(this, edits, log);
    return target.build(pick);
  }
}

function makePickFunctionWithEdits(
  origin: CallLog,
  edits: MultiEdit,
  log?: CallBuffer,
) {
  function buildPick<T>(
    req: PickRequest,
    before: number[],
    edit: Edit,
  ): T {
    const responder = new EditResponder(before, () => edit);
    const reply = responder.nextPick(req);

    log?.endPick(req, reply);

    return reply as T;
  }

  function buildScript<T>(
    script: Script<T>,
    before: Call<unknown>,
    editor: GroupEdit,
  ): T {
    if (
      editor === keep && before.val !== regen &&
      before.arg === script
    ) {
      // Skip the script call and return the cached value.
      log?.keep();
      return before.val as T;
    }
    const responder = new EditResponder(before.picks.replies, editor);
    const pick = makePickFunction(responder, { log }); // log picks only
    const val = script.buildFrom(pick);
    log?.endScript(script, val);
    if (responder.edited) {
      log?.setChanged();
    }
    return val;
  }

  let callIndex = 0;

  const pick_function = <T>(
    req: Pickable<T>,
    opts?: PickFunctionOpts<T>,
  ): T => {
    let groupEdit = edits(callIndex++);
    while (groupEdit === removeGroup) {
      groupEdit = edits(callIndex++);
      log?.skipOriginal();
    }

    if (req instanceof PickRequest) {
      const before = origin.firstReplyAt(callIndex - 1, req.min);
      const edit = groupEdit(0, req, before);
      return buildPick(req, [before], edit);
    }

    // handle a script call
    const script = Script.from(req);
    const before = callIndex <= origin.length ? origin.callAt(callIndex - 1) : {
      arg: script,
      picks: PickView.empty,
      val: regen,
    };
    const val = buildScript(script, before, groupEdit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }

    return val;
  };

  return pick_function;
}
