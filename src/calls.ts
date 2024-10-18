import { type CallSink, usePicks } from "./build.ts";
import type { Script } from "./script_class.ts";
import type { Range } from "./picks.ts";

import { assert } from "@std/assert";
import { PickLog, PickRequest, PickView } from "./picks.ts";
import { filtered } from "./results.ts";
import type { Pickable } from "./pickable.ts";
import { Filtered, type PickFunctionOpts } from "@/arbitrary.ts";

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
  readonly starts: number[] = [];
  readonly callReqs: (Range | Script<unknown>)[] = [];
  readonly vals: unknown[] = [];

  pushPick(req: Range, reply: number): void {
    this.pickLog.push(req, reply);
  }

  popPicks(count: number): void {
    this.pickLog.nextViewLength -= count;
  }

  endPickCall(): void {
    const start = this.pickLog.viewStart++;
    assert(start + 1 === this.pickLog.length);

    this.starts.push(start);
    this.callReqs.push(this.pickLog.reqs[start]);
    this.vals.push(this.pickLog.replies[start]);
  }

  endScriptCall<T>(arg: Script<T>, val: T): void {
    // record the start of this call's picks
    this.starts.push(this.pickLog.viewStart);
    this.pickLog.viewStart = this.pickLog.length;

    // record the call
    this.callReqs.push(arg);
    const shouldCache = arg.cachable && Object.isFrozen(val);
    this.vals.push(shouldCache ? val : regen);
  }

  picksAt(index: number): PickView {
    const end = (index + 1 < this.starts.length)
      ? this.starts[index + 1]
      : this.pickLog.length;
    return new PickView(this.pickLog, this.starts[index], end);
  }

  callAt(index: number): Call<unknown> {
    return {
      arg: this.callReqs[index],
      picks: this.picksAt(index),
      val: this.vals[index],
    };
  }

  get calls(): IterableIterator<Call<unknown>> {
    function* generateCalls(log: CallLog): IterableIterator<Call<unknown>> {
      const len = log.callReqs.length;
      for (let i = 0; i < len; i++) {
        yield log.callAt(i);
      }
    }
    return generateCalls(this);
  }

  buildAt<T>(req: Pickable<T>, index: number): T {
    const call = this.callAt(index);
    if (call.val !== regen && call.arg === req) {
      // Skip the script call and return the cached value.
      return call.val as T;
    }
    const picks = usePicks(...call.picks.replies);
    return req.buildFrom(picks);
  }

  /**
   * Builds a pickable using this log.
   */
  build<T>(target: Pickable<T>): T | typeof filtered {
    try {
      return target.buildFrom(this.makePlaybackPickFunction());
    } catch (e) {
      if (e instanceof Filtered) {
        return filtered;
      }
      throw e;
    }
  }

  private makePlaybackPickFunction() {
    let index = 0;

    const pick_function = <T>(
      req: Pickable<T>,
      opts?: PickFunctionOpts<T>,
    ): T => {
      if (req instanceof PickRequest) {
        if (index >= this.starts.length) {
          return req.min as T;
        }
        const reply = this.pickLog.replies[this.starts[index++]];
        return (req.inRange(reply) ? reply : req.min) as T;
      }

      // handle a script call
      const val = this.buildAt(req, index++);

      const accept = opts?.accept;
      if (accept !== undefined && !accept(val)) {
        throw new Filtered("not accepted");
      }

      return val;
    };

    return pick_function;
  }
}
