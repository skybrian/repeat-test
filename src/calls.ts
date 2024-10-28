import type { Range } from "./picks.ts";
import type { PickLogger } from "./build.ts";

import { assert } from "@std/assert";
import { PickBuffer, PickList } from "./picks.ts";
import { Script } from "./script_class.ts";

export const regen = Symbol("regen");

/**
 * Records a previous call to a {@link PickFunction}.
 */
export class Call<T = unknown> {
  readonly val: T | typeof regen;

  constructor(
    readonly arg: Range | Script<T>,
    val: T | typeof regen,
    readonly group: PickList,
  ) {
    if (arg instanceof Script) {
      const shouldCache = arg.cachable && Object.isFrozen(val);
      this.val = shouldCache ? val : regen;
    } else {
      this.val = val;
    }
  }

  static none = new Call(
    Script.neverReturns,
    regen,
    PickList.empty,
  );
}

export class CallBuffer implements PickLogger {
  /** Holds 3-entry tuples representing a call. */
  readonly #log: unknown[] = [];

  /** The length used in the #log array. */
  #len = 0;

  /** The number of calls recorded. */
  #calls = 0;

  readonly #buf = new PickBuffer();

  get complete(): boolean {
    return this.#buf.pushCount === 0;
  }

  /** Returns the entries the log. */
  get length(): number {
    return this.#calls;
  }

  reset() {
    this.#len = 0;
    this.#calls = 0;
    this.#buf.reset();
  }

  push(req: Range, reply: number): void {
    this.#buf.push(req, reply);
  }

  undoPushes(removeCount: number): void {
    this.#buf.undoPushes(removeCount);
  }

  endPick(): void {
    assert(this.#buf.pushCount === 1);
    const group = this.#buf.takeList();
    this.endCall(group.reqAt(0), group.replyAt(0), group);
  }

  endScript<T>(arg: Script<T>, val: T): void {
    const picks = this.#buf.takeList();
    this.endCall(arg, val, picks);
  }

  /** Preserves a call from a previous log. */
  keep(call: Call<unknown>): void {
    assert(this.complete);
    const { arg, val, group } = call;
    this.endCall(arg, val, group);
  }

  take(): Call[] {
    assert(this.complete);
    const calls: Call[] = Array(this.#calls);
    let i = 0;
    for (let start = 0; start < this.#len; start += 3) {
      calls[i++] = new Call(
        this.#log[start] as Range | Script<unknown>,
        this.#log[start + 1] as unknown | typeof regen,
        this.#log[start + 2] as PickList,
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
    const start = this.#len;
    this.#log[start] = arg;
    this.#log[start + 1] = val;
    this.#log[start + 2] = picks;
    this.#len += 3;
    this.#calls++;
  }
}

export function* allReplies(calls: Call<unknown>[]): Iterable<number> {
  for (const call of calls) {
    yield* call.group.replies;
  }
}
