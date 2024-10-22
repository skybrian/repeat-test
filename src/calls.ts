import type { PickLogger } from "./build.ts";
import type { Range } from "./picks.ts";
import type { Pickable } from "./pickable.ts";
import type { Edit, GroupEdit, MultiEdit } from "./edits.ts";

import { assert } from "@std/assert";
import { Filtered, type PickFunctionOpts } from "@/arbitrary.ts";
import { filtered } from "./results.ts";
import { PickLog, PickRequest, PickView } from "./picks.ts";
import { Script } from "./script_class.ts";
import { makePickFunction } from "./build.ts";
import { EditResponder, keep, removeGroup, snip } from "./edits.ts";

export const regen = Symbol("regen");

export type Call<T> = {
  readonly arg: Range | Script<T>;
  readonly picks: PickView;
  readonly val: T | typeof regen;
};

type Props = {
  readonly pickLog: PickLog;
  readonly starts: number[];
  readonly callReqs: (Range | Script<unknown>)[];
  readonly vals: unknown[];
};

export class CallBuffer implements PickLogger {
  private props: Props = {
    pickLog: new PickLog(),
    starts: [],
    callReqs: [],
    vals: [],
  };

  #before: Iterator<Call<unknown>>;
  #changed = false;

  constructor(readonly origin?: CallLog) {
    this.#before = origin?.calls ?? [][Symbol.iterator]();
  }

  get complete(): boolean {
    return this.props.pickLog.nextViewLength === 0;
  }

  /** Returns the number of calls recorded. */
  get length(): number {
    return this.props.starts.length;
  }

  /** Returns true if the recorded log is different from the origin. */
  get changed(): boolean {
    return this.#changed || !this.complete ||
      this.length !== this.origin?.length;
  }

  reset() {
    this.props = {
      pickLog: new PickLog(),
      starts: [],
      callReqs: [],
      vals: [],
    };
  }

  setChanged() {
    // TODO: compare picks as they're added?
    this.#changed = true;
  }

  push(req: Range, reply: number): void {
    this.props.pickLog.push(req, reply);
  }

  undoPushes(count: number): void {
    this.props.pickLog.nextViewLength -= count;
  }

  endPick(): void {
    const { pickLog } = this.props;
    assert(pickLog.nextViewLength === 1);

    const req = pickLog.reqs[pickLog.viewStart];
    const reply = pickLog.replies[pickLog.viewStart];
    this.endCall(req, reply);

    const next = this.#before.next();
    if (next.done || next.value.arg !== req || next.value.val !== reply) {
      this.#changed = true;
    }
  }

  endScript<T>(arg: Script<T>, val: T): void {
    const shouldCache = arg.cachable && Object.isFrozen(val);
    const storedVal = shouldCache ? val : regen;
    this.endCall(arg, storedVal);

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
    const { arg, picks, val } = next.value;

    this.props.pickLog.pushAll(picks.reqs, picks.replies);
    this.endCall(arg, val);
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

  private endCall<T>(arg: Range | Script<T>, val: T | typeof regen): void {
    const { pickLog, starts, callReqs, vals } = this.props;

    // record the start of this call's picks
    starts.push(pickLog.viewStart);
    pickLog.viewStart = pickLog.length;

    // record the call
    callReqs.push(arg);
    vals.push(val);
  }
}

/**
 * The calls that were made to a pick function.
 */
export class CallLog {
  constructor(readonly props: Props) {}

  get length(): number {
    return this.props.starts.length;
  }

  get replies(): Iterable<number> {
    return this.props.pickLog.replies;
  }

  picksAt(index: number): PickView {
    assert(index >= 0);

    if (index >= this.length) {
      return PickView.empty;
    }

    const { start, end } = this.rangeAt(index);
    return new PickView(this.props.pickLog, start, end);
  }

  repliesAt(index: number): number[] {
    assert(index >= 0);

    if (index >= this.length) {
      return [];
    }

    const { start, end } = this.rangeAt(index);
    return this.props.pickLog.replies.slice(start, end);
  }

  callAt(index: number): Call<unknown> {
    const { callReqs, vals } = this.props;
    return {
      arg: callReqs[index],
      picks: this.picksAt(index),
      val: vals[index],
    };
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
  build<T>(target: Pickable<T>): T | typeof filtered {
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

  private rangeAt(index: number): { start: number; end: number } {
    const { starts, pickLog } = this.props;
    assert(index >= 0 && index < starts.length);
    const start = starts[index];
    const end = (index + 1 < starts.length)
      ? starts[index + 1]
      : pickLog.length;
    return { start, end };
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

    log?.push(req, reply);
    log?.endPick();

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
      const before = origin.repliesAt(callIndex - 1);
      const edit = groupEdit(0, req, before[0]);
      return buildPick(req, before, edit);
    }

    // handle a script call
    const script = Script.from(req);
    const before = origin.callAt(callIndex - 1);
    const val = buildScript(script, before, groupEdit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }

    return val;
  };

  return pick_function;
}
