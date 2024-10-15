import type { CallSink } from "./build.ts";
import type { Script } from "./script_class.ts";
import type { PickRequest, Range } from "./picks.ts";

import { assert } from "@std/assert";
import { PickLog, PickView } from "./picks.ts";

export type Call<T> = {
  readonly arg: Range | Script<T>;
  readonly picks: PickView;
  readonly val: T;
};

/**
 * Records calls to a pick function.
 */
export class CallLog implements CallSink {
  readonly pickLog = new PickLog();
  readonly #calls: Call<unknown>[] = [];

  get topLevelCalls(): Iterable<Call<unknown>> {
    return generateCalls(this.pickLog, this.#calls);
  }

  get nextCallPicks() {
    return this.pickLog.nextViewLength;
  }

  set nextCallPicks(newVal: number) {
    this.pickLog.nextViewLength = newVal;
  }

  pushPick(level: number, req: PickRequest, reply: number): void {
    this.pickLog.push(req, reply);
    if (level === 0) {
      assert(this.pickLog.nextViewLength === 1);
      this.pickLog.viewStart++;
    }
  }

  pushScript<T>(level: number, arg: Script<T>, val: T): void {
    if (level === 0) {
      const picks = this.pickLog.takeView();
      this.#calls.push({ arg, picks, val });
    }
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
