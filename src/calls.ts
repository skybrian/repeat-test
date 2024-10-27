import type { Range } from "./picks.ts";
import type { PickFunction } from "./pickable.ts";
import type { PickLogger } from "./build.ts";
import type { GroupEdit, MultiEdit } from "./edits.ts";

import { assert } from "@std/assert";
import { Filtered, type Pickable, type PickFunctionOpts } from "@/arbitrary.ts";
import { filtered } from "./results.ts";
import { PickBuffer, PickList, PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";
import { makePickFunction } from "./build.ts";
import { EditResponder, keep } from "./edits.ts";

export const regen = Symbol("regen");

export type Call<T> = {
  readonly arg: Range | Script<T>;
  readonly val: T | typeof regen;
  readonly group: PickList;
};

const defaultCall: Call<unknown> = {
  arg: Script.neverReturns,
  val: regen,
  group: PickList.empty,
};

export class CallBuffer implements PickLogger {
  readonly #args: (Range | Script<unknown>)[] = [];
  readonly #vals: unknown[] = [];
  readonly #groups: PickList[] = [];
  readonly #buf = new PickBuffer();

  get complete(): boolean {
    return this.#buf.pushCount === 0;
  }

  /** Returns the number of calls recorded. */
  get length(): number {
    return this.#args.length;
  }

  reset() {
    this.#args.length = 0;
    this.#vals.length = 0;
    this.#groups.length = 0;
    this.#buf.reset();
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
    this.endCall(req, reply, this.#buf.takeList());
  }

  endScript<T>(arg: Script<T>, val: T): void {
    const shouldCache = arg.cachable && Object.isFrozen(val);
    const storedVal = shouldCache ? val : regen;
    const picks = this.#buf.takeList();
    this.endCall(arg, storedVal, picks);
  }

  /** Preserves a call from a previous log. */
  keep(call: Call<unknown>): void {
    assert(this.complete);
    const { arg, val, group } = call;
    this.endCall(arg, val, group);
  }

  takeLog(): CallLog {
    assert(this.complete);
    const log = new CallLog(
      this.#args.slice(),
      this.#vals.slice(),
      this.#groups.slice(),
    );
    this.reset();
    return log;
  }

  private endCall<T>(
    arg: Range | Script<T>,
    val: T | typeof regen,
    picks: PickList,
  ): void {
    this.#args.push(arg);
    this.#vals.push(val);
    this.#groups.push(picks);
  }
}

export const unchanged = Symbol("unchanged");

/**
 * The calls that were made to a pick function.
 */
export class CallLog {
  #args: (Range | Script<unknown>)[] = [];
  #vals: unknown[] = [];
  #groups: PickList[] = [];

  constructor(
    args: (Range | Script<unknown>)[],
    vals: unknown[],
    groups: PickList[],
  ) {
    this.#args = args;
    this.#vals = vals;
    this.#groups = groups;
  }

  get length(): number {
    return this.#args.length;
  }

  get replies(): Iterable<number> {
    function* generate(groups: PickList[]): Iterable<number> {
      for (const group of groups) {
        yield* group.replies;
      }
    }
    return generate(this.#groups);
  }

  /**
   * Returns the group of picks for the call at the given offset.
   */
  groupAt(offset: number): PickList {
    assert(offset >= 0);

    if (offset >= this.length) {
      return PickList.empty;
    }

    return this.#groups[offset];
  }

  firstReplyAt(offset: number, defaultReply: number): number {
    assert(offset >= 0);

    if (offset >= this.length) {
      return defaultReply;
    }

    const group = this.#groups[offset];
    assert(group.length > 0);
    return group.replyAt(0);
  }

  /**
   * Returns the call at the given offset.
   *
   * If the offset is higher than the length of the list, returns {@link defaultCall}.
   */
  callAt(offset: number): Call<unknown> {
    assert(offset >= 0);
    if (offset >= this.length) {
      return defaultCall;
    }
    const arg = this.#args[offset];
    const val = this.#vals[offset];
    const group = this.groupAt(offset);
    return { arg, val, group };
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
   * Runs a script using the calls from this log.
   */
  run<T>(target: Script<T>): T | typeof filtered {
    const handlers = new Handlers(this);
    const pick: PickFunction = (req, opts) => {
      return handlers.dispatch(keep, req, opts);
    };
    return target.run(pick);
  }

  /**
   * Runs a script using the calls from this log, after applying the given edits.
   */
  runWithEdits<T>(
    target: Script<T>,
    edits: MultiEdit,
    log?: CallBuffer,
  ): T | typeof unchanged | typeof filtered {
    if (!target.splitCalls) {
      // Record a single call.
      const picks = new EditResponder(this.replies, edits(0));
      const pick = makePickFunction(picks, { log });
      const val = target.run(pick);
      if (val === filtered) {
        return filtered;
      }
      log?.endScript(target, val);
      return picks.edited ? val : unchanged;
    }

    const handlers = new Handlers(this, log);
    const pick: PickFunction = (req, opts) => {
      const edit = edits(handlers.callIndex);
      return handlers.dispatch(edit, req, opts);
    };

    const val = target.run(pick);
    if (val === filtered) {
      return filtered;
    }
    return handlers.changed ? val : unchanged;
  }

  runWithDeletedRange<T>(
    target: Script<T>,
    start: number,
    end: number,
    log?: CallBuffer,
  ): T | typeof unchanged | typeof filtered {
    if (start === end) {
      return unchanged; // Nothing to do.
    }
    assert(start < end);

    const handlers = new Handlers(this, log);
    const pick: PickFunction = (req, opts) => {
      if (handlers.callIndex === start) {
        handlers.callIndex = end;
        handlers.changed = true;
      }
      return handlers.dispatch(keep, req, opts);
    };

    const val = target.run(pick);
    if (val === filtered) {
      return filtered;
    }
    return handlers.changed ? val : unchanged;
  }
}

class Handlers {
  callIndex = 0;
  changed = false;

  constructor(
    readonly origin: CallLog,
    readonly log?: CallBuffer,
  ) {}

  dispatch<T>(
    edit: GroupEdit,
    req: Pickable<T>,
    opts?: PickFunctionOpts<T>,
  ): T {
    const idx = this.callIndex++;

    if (req instanceof PickRequest) {
      return this.handlePick(req, idx, edit);
    }

    const val = this.handleScript(Script.from(req), idx, edit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }
    return val;
  }

  handlePick<T>(
    req: PickRequest,
    callIndex: number,
    groupEdit: GroupEdit,
  ): T {
    const before = this.origin.firstReplyAt(callIndex, req.min);
    const edit = groupEdit(0, req, before);
    const responder = new EditResponder([before], () => edit);
    const reply = responder.nextPick(req);

    this.log?.endPick(req, reply);
    if (responder.edited) {
      this.changed = true;
    }
    return reply as T;
  }

  handleScript<T>(
    script: Script<T>,
    callIndex: number,
    groupEdit: GroupEdit,
  ): T {
    const before = this.origin.callAt(callIndex);

    if (
      groupEdit === keep && before.val !== regen &&
      before.arg === script
    ) {
      // Skip the script call and return the cached value.
      this.log?.keep(before);
      return before.val as T;
    }

    const responder = new EditResponder(before.group.replies, groupEdit);
    const pick = makePickFunction(responder, { log: this.log }); // log picks only
    const val = script.directBuild(pick);
    this.log?.endScript(script, val);
    if (responder.edited) {
      this.changed = true;
    }
    return val;
  }
}
