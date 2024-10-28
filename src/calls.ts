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
  #len = 0;

  /** Holds 3-entry tuples representing a call. */
  readonly #log: unknown[] = [];

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
    const calls: Call[] = Array(this.length);
    for (let i = 0; i < this.#len; i++) {
      const start = i * 3;
      calls[i] = new Call(
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
    const i = this.#len++;
    const start = i * 3;
    this.#log[start] = arg;
    this.#log[start + 1] = val;
    this.#log[start + 2] = picks;
  }
}

export function* allReplies(calls: Call<unknown>[]): Iterable<number> {
  for (const call of calls) {
    yield* call.group.replies;
  }
}
