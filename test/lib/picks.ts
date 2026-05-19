import { Backtracker } from "../../src/backtracking.ts";
import { makePickFunction, type PickResponder } from "../../src/build.ts";
import { PartialTracker } from "../../src/partial_tracker.ts";
import type { PickFunction } from "../../src/pickable.ts";
import {
  alwaysPickMin,
  type IntPicker,
  type IntRequest,
} from "../../src/picks.ts";

/**
 * Returns a single-state picker that always picks the same number.
 *
 * It will throw an exception if it can't satisfy a request.
 */
export function alwaysPick(n: number) {
  const picker: IntPicker = {
    pick: (req) => {
      if (!req.inRange(n)) {
        throw new Error(
          `can't satisfy request (${req.min}, ${req.max}) with ${n}`,
        );
      }
      return n;
    },
  };
  Object.freeze(picker);
  return picker;
}

/**
 * Playouts in depth-first order, starting with all minimum picks.
 */
export function depthFirstPlayouts(): Backtracker {
  return new Backtracker(new PartialTracker(alwaysPickMin));
}

/** Creates a simple, non-backtracking pick source. */
export function responderFromReplies(replies: number[]): PickResponder {
  let depth = 0;

  return {
    startAt(newDepth: number): boolean {
      // can't backtrack; no alternative picks available
      return newDepth === depth;
    },
    nextPick(req: IntRequest): number | undefined {
      if (depth >= replies.length) {
        depth++; // prevent backtracking
        return req.min;
      }
      const pick = replies[depth++];
      if (pick < req.min || pick > req.max) {
        return undefined; // filtered out
      }
      return pick;
    },
    get depth(): number {
      return depth;
    },
  };
}

/**
 * Creates a pick function that plays a single pick sequence.
 */
export function usePicks(...replies: number[]): PickFunction {
  return makePickFunction(responderFromReplies(replies));
}
