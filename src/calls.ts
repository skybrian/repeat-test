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

/**
 * Records a previous call to a {@link PickFunction}.
 */
export class Call<T = unknown> {
  constructor(
    readonly arg: Range | Script<T>,
    readonly val: T | typeof regen,
    readonly group: PickList,
  ) {}

  static none = new Call(
    Script.neverReturns,
    regen,
    PickList.empty,
  );
}

export class CallBuffer implements PickLogger {
  #len = 0;
  readonly #args: (Range | Script<unknown>)[] = [];
  readonly #vals: unknown[] = [];
  readonly #groups: PickList[] = [];

  readonly #buf = new PickBuffer();

  get complete(): boolean {
    return this.#buf.pushCount === 0;
  }

  /** Returns the number of calls recorded. */
  get length(): number {
    return this.#len;
  }

  reset() {
    this.#len = 0;
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

  take(): Call[] {
    assert(this.complete);
    const calls: Call[] = Array(this.length);
    for (let i = 0; i < this.#len; i++) {
      calls[i] = new Call(
        this.#args[i],
        this.#vals[i],
        this.#groups[i],
      );
    }
    this.reset();
    return calls;
  }

  private endCall<T>(
    arg: Range | Script<T>,
    val: T | typeof regen,
    picks: PickList,
  ): void {
    const i = this.#len++;
    this.#args[i] = arg;
    this.#vals[i] = val;
    this.#groups[i] = picks;
  }
}

export function* allReplies(calls: Call<unknown>[]): Iterable<number> {
  for (const call of calls) {
    yield* call.group.replies;
  }
}

/**
 * Runs a script by replaying a list of calls.
 */
export function runWithCalls<T>(
  target: Script<T>,
  calls: Call[],
): T | typeof filtered {
  const handlers = new Handlers(calls);
  const pick: PickFunction = (req, opts) => {
    return handlers.dispatch(keep, req, opts);
  };
  return target.run(pick);
}

export const unchanged = Symbol("unchanged");

/**
 * Runs a script by replying a list of calls, after applying the given edits.
 */
export function runWithEdits<T>(
  target: Script<T>,
  calls: Call[],
  edits: MultiEdit,
  log?: CallBuffer,
): T | typeof unchanged | typeof filtered {
  if (!target.splitCalls) {
    // Record a single call.
    const picks = new EditResponder(allReplies(calls), edits(0));
    const pick = makePickFunction(picks, { log });
    const val = target.run(pick);
    if (val === filtered) {
      return filtered;
    }
    log?.endScript(target, val);
    return picks.edited ? val : unchanged;
  }

  const handlers = new Handlers(calls, log);
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

/**
 * Runs a script using the calls from this log, after deleting the calls in the given range.
 */
export function runWithDeletedRange<T>(
  target: Script<T>,
  input: Call[],
  start: number,
  end: number,
  log?: CallBuffer,
): T | typeof unchanged | typeof filtered {
  assert(start < end);

  const handlers = new Handlers(input, log);
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

class Handlers {
  callIndex = 0;
  changed = false;

  constructor(
    readonly origin: Call[],
    readonly log?: CallBuffer,
  ) {}

  dispatch<T>(
    edit: GroupEdit,
    req: Pickable<T>,
    opts?: PickFunctionOpts<T>,
  ): T {
    const idx = this.callIndex++;
    const before = idx >= this.origin.length ? Call.none : this.origin[idx];

    if (req instanceof PickRequest) {
      return this.handlePick(req, before.group, edit);
    }

    const val = this.handleScript(Script.from(req), before, edit);

    const accept = opts?.accept;
    if (accept !== undefined && !accept(val)) {
      throw new Filtered("not accepted");
    }
    return val;
  }

  handlePick<T>(
    req: PickRequest,
    group: PickList,
    groupEdit: GroupEdit,
  ): T {
    const before = group.length === 0 ? req.min : group.replyAt(0);
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
    before: Call<unknown>,
    groupEdit: GroupEdit,
  ): T {
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
