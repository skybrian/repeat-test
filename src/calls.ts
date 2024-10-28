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
