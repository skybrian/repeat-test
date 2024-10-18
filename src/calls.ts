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
  readonly #calls: Call<unknown>[] = [];

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

  get calls(): IterableIterator<Call<unknown>> {
    return generateCalls(this.pickLog, this.#calls);
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
    const pickLog = this.pickLog;
    let pickIdx = 0;
    const calls = this.#calls;
    let callIdx = 0;

    function handleCall<T>(
      req: Pickable<T>,
      nextCall: Call<unknown> | undefined,
    ): T {
      if (nextCall === undefined) {
        if (pickIdx < pickLog.length) {
          // Use the next pick as input to the script.
          const picks = usePicks(pickLog.replies[pickIdx++]);
          return req.buildFrom(picks);
        }
        return req.buildFrom(usePicks());
      }

      callIdx++;
      pickIdx = nextCall.picks.end;

      if (nextCall.val !== regen && req === nextCall.arg) {
        // Skip the script call and return the cached value.
        return nextCall.val as T;
      }

      const picks = usePicks(...nextCall.picks.replies);
      return req.buildFrom(picks);
    }

    function pick_function<T>(req: Pickable<T>, opts?: PickFunctionOpts<T>): T {
      const nextCall = callIdx < calls.length ? calls[callIdx] : undefined;

      if (req instanceof PickRequest) {
        const reply = (pickIdx < pickLog.length)
          ? pickLog.replies[pickIdx++]
          : req.min;
        if (nextCall?.picks.start === pickIdx - 1) {
          // Skip remaining picks from the call.
          callIdx++;
          pickIdx = nextCall.picks.end;
        }
        return (req.inRange(reply) ? reply : req.min) as T;
      }

      // handle a script call
      const val = handleCall(req, nextCall);

      const accept = opts?.accept;
      if (accept !== undefined && !accept(val)) {
        throw new Filtered("not accepted");
      }

      return val;
    }

    return pick_function;
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
): IterableIterator<Call<unknown>> {
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
