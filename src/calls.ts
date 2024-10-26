import type { Range } from "./picks.ts";
import type { Pickable } from "./pickable.ts";
import type { PickLogger } from "./build.ts";
import type { Edit, GroupEdit, MultiEdit } from "./edits.ts";

import { assert } from "@std/assert";
import { Filtered, type PickFunctionOpts } from "@/arbitrary.ts";
import { filtered } from "./results.ts";
import { PickBuffer, PickList, PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";
import { makePickFunction } from "./build.ts";
import {
  EditResponder,
  keep,
  removeGroup,
  removeGroups,
  snip,
} from "./edits.ts";

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

  argAt(offset: number): Range | Script<unknown> {
    return this.#args[offset];
  }

  cachedValAt(offset: number): unknown | typeof regen {
    return this.#vals[offset];
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
    // Reuse cached pick results by using the editing version of the pick function.
    const pick = makePickFunctionWithEdits(this, () => keep, () => {});
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
      let edit = edits(0);
      if (edit === removeGroup) {
        edit = snip;
      }
      const picks = new EditResponder(this.replies, edit);
      const pick = makePickFunction(picks, { log });
      const val = target.run(pick);
      if (val === filtered) {
        return filtered;
      }
      log?.endScript(target, val);
      return picks.edited ? val : unchanged;
    }

    let changed = false;
    function onChange() {
      changed = true;
    }

    const pick = makePickFunctionWithEdits(this, edits, onChange, log);
    const val = target.run(pick);
    if (val === filtered) {
      return filtered;
    }

    return changed ? val : unchanged;
  }

  runWithDeletedRange<T>(
    target: Script<T>,
    start: number,
    end: number,
    log?: CallBuffer,
  ): T | typeof unchanged | typeof filtered {
    const toDelete = Array(end - start).fill(0).map((_, i) => i + start);
    return this.runWithEdits(target, removeGroups(new Set(toDelete)), log);
  }
}

function makePickFunctionWithEdits(
  origin: CallLog,
  edits: MultiEdit,
  changed: () => void,
  log?: CallBuffer,
) {
  function handlePickRequest<T>(
    req: PickRequest,
    before: number,
    edit: Edit,
  ): T {
    const responder = new EditResponder([before], () => edit);
    const reply = responder.nextPick(req);

    log?.endPick(req, reply);
    if (responder.edited) {
      changed();
    }

    return reply as T;
  }

  function handleScript<T>(
    script: Script<T>,
    before: Call<unknown>,
    edit: GroupEdit,
  ): T {
    if (
      edit === keep && before.val !== regen &&
      before.arg === script
    ) {
      // Skip the script call and return the cached value.
      log?.keep(before);
      return before.val as T;
    }
    const responder = new EditResponder(before.group.replies, edit);
    const pick = makePickFunction(responder, { log }); // log picks only
    const val = script.directBuild(pick);
    log?.endScript(script, val);
    if (responder.edited) {
      changed();
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
      changed();
    }
    const idx = callIndex - 1;

    if (req instanceof PickRequest) {
      const before = origin.firstReplyAt(idx, req.min);
      const pickEdit = groupEdit(0, req, before);
      return handlePickRequest(req, before, pickEdit);
    }

    // handle a script call
    const script = Script.from(req);
    const before = origin.callAt(idx);
    const val = handleScript(script, before, groupEdit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }

    return val;
  };

  return pick_function;
}
