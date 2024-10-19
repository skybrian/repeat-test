import { type PickLogger, usePicks } from "./build.ts";
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

type Props = {
  readonly pickLog: PickLog;
  readonly starts: number[];
  readonly callReqs: (Range | Script<unknown>)[];
  readonly vals: unknown[];
};

export class CallBuffer implements PickLogger {
  private props: Props = {
    pickLog: new PickLog(),
    starts: [],
    callReqs: [],
    vals: [],
  };

  reset() {
    this.props = {
      pickLog: new PickLog(),
      starts: [],
      callReqs: [],
      vals: [],
    };
  }

  push(req: Range, reply: number): void {
    this.props.pickLog.push(req, reply);
  }

  undoPushes(count: number): void {
    this.props.pickLog.nextViewLength -= count;
  }

  endPick(): void {
    const { pickLog, starts, callReqs, vals } = this.props;

    const start = pickLog.viewStart++;
    assert(start + 1 === pickLog.length);

    starts.push(start);
    callReqs.push(pickLog.reqs[start]);
    vals.push(pickLog.replies[start]);
  }

  endScript<T>(arg: Script<T>, val: T): void {
    const { pickLog, starts, callReqs, vals } = this.props;

    // record the start of this call's picks
    starts.push(pickLog.viewStart);
    pickLog.viewStart = pickLog.length;

    // record the call
    callReqs.push(arg);
    const shouldCache = arg.cachable && Object.isFrozen(val);
    vals.push(shouldCache ? val : regen);
  }

  takeLog(): CallLog {
    const log = new CallLog(this.props);
    this.reset();
    return log;
  }
}

/**
 * The calls that were made to a pick function.
 */
export class CallLog {
  constructor(readonly props: Props) {}

  get length(): number {
    return this.props.starts.length;
  }

  get replies(): number[] {
    return this.props.pickLog.replies;
  }

  get pickView(): PickView {
    return new PickView(this.props.pickLog, 0, this.props.pickLog.length);
  }

  picksAt(index: number): PickView {
    const { starts, pickLog } = this.props;

    const end = (index + 1 < starts.length)
      ? starts[index + 1]
      : pickLog.length;
    return new PickView(pickLog, starts[index], end);
  }

  callAt(index: number): Call<unknown> {
    const { callReqs, vals } = this.props;
    return {
      arg: callReqs[index],
      picks: this.picksAt(index),
      val: vals[index],
    };
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
    const { pickLog, starts } = this.props;
    let index = 0;

    const pick_function = <T>(
      req: Pickable<T>,
      opts?: PickFunctionOpts<T>,
    ): T => {
      if (req instanceof PickRequest) {
        if (index >= starts.length) {
          return req.min as T;
        }
        const reply = pickLog.replies[starts[index++]];
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
