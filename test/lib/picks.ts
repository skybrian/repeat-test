import { Backtracker } from "../../src/backtracking.ts";
import { PartialTracker } from "../../src/partial_tracker.ts";
import { alwaysPickMin, type IntPicker } from "../../src/picks.ts";

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
