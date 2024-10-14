import type { PickRequest, PickView } from "./picks.ts";
import type { CallSink } from "./build.ts";
import type { Script } from "./script_class.ts";

import { PickLog } from "./picks.ts";

export type Call<T> = {
  readonly script: Script<T>;
  readonly picks: PickView;
  readonly val: T;
};

/**
 * Records calls to a pick function.
 */
export class CallLog implements CallSink {
  readonly pickLog = new PickLog();
  readonly calls: Call<unknown>[] = [];

  get nextCallPicks() {
    return this.pickLog.nextViewLength;
  }

  set nextCallPicks(newVal: number) {
    this.pickLog.nextViewLength = newVal;
  }

  pushPick(req: PickRequest, reply: number): void {
    this.pickLog.push(req, reply);
  }

  pushCall<T>(script: Script<T>, val: T): void {
    const picks = this.pickLog.takeView();
    this.calls.push({ script, picks, val });
  }
}
