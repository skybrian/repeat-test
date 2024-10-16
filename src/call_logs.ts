import type { CallSink } from "./build.ts";
import type { Script } from "./script_class.ts";
import type { Range } from "./picks.ts";

import { assert } from "@std/assert";
import { PickLog, PickView } from "./picks.ts";

export const regen = Symbol("regen");

export type Call<T> = {
  readonly arg: Range | Script<T>;
  readonly picks: PickView;
  readonly val: T | typeof regen;
};

/**
 * Records calls to a pick function.
 */
export class CallLog implements CallSink {
  readonly pickLog = new PickLog();
  readonly #calls: Call<unknown>[] = [];

  get calls(): Iterable<Call<unknown>> {
    return generateCalls(this.pickLog, this.#calls);
  }

  startCall<T>(): void {
    assert(this.pickLog.nextViewLength === 0);
  }

  pushPick(req: Range, reply: number): void {
    this.pickLog.push(req, reply);
  }

  popPicks(count: number): void {
    this.pickLog.nextViewLength -= count;
  }

  endPickCall(): void {
    // Create call entry lazily.
    assert(this.pickLog.nextViewLength === 1);
    this.pickLog.viewStart++;
  }

  endScriptCall<T>(arg: Script<T>, val: T): void {
    const picks = this.pickLog.takeView();
    const shouldCache = arg.cachable && Object.isFrozen(val);
    this.#calls.push({ arg, picks, val: shouldCache ? val : regen });
  }
}

function callFromPick(log: PickLog, idx: number): Call<unknown> {
  const arg = log.reqs[idx];
  const val = log.replies[idx];
  const picks = new PickView(log, idx, idx + 1);
  return { arg, picks, val };
}

function* generateCalls(
  log: PickLog,
  calls: Call<unknown>[],
): Iterable<Call<unknown>> {
  let pick = 0;
  let call = 0;
  while (call < calls.length) {
    const next = calls[call];
    while (pick < next.picks.start) {
      yield callFromPick(log, pick);
      pick++;
    }
    yield next;
    pick = next.picks.end;
    call++;
  }
  while (pick < log.length) {
    yield callFromPick(log, pick);
    pick++;
  }
}
