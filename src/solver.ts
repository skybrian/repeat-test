import { alwaysPickDefault, IntPicker } from "./picks.ts";
import {
  Playout,
  PlayoutBuffer,
  PlayoutFailed,
  PlayoutLogger,
} from "./playouts.ts";

/**
 * Walks a search tree and returns whatever is found at a leaf.
 *
 * Each time it needs to make a choice, it uses a pick from the provided picker.
 *
 * Return the value found at a leaf, or throws {@link PlayoutFailed} if no value
 * was found (a dead end).
 */
export type PlayoutFunction<T> = (
  picker: IntPicker,
  log: PlayoutLogger,
) => T;

export class Solution<T> {
  constructor(readonly val: T, private readonly playout: Playout) {
    const { spanStarts, spanEnds } = this.playout;
    if (spanStarts.length !== spanEnds.length) {
      throw new Error("spanStarts and spanEnds must be the same length");
    }
  }

  get picks() {
    return this.playout.picks;
  }

  getNestedPicks() {
    return this.playout.getNestedPicks();
  }
}

/**
 * Visits every leaf in a search tree in order, depth-first. Starts with all
 * default picks.
 */
export function* generateAllSolutions<T>(
  runPlayout: PlayoutFunction<T>,
): Generator<Solution<T>> {
  const buffer = new PlayoutBuffer(alwaysPickDefault);
  let next: IntPicker & PlayoutLogger | null = buffer.record();
  while (next !== null) {
    try {
      const val = runPlayout(next, next);
      if (buffer.playing) {
        throw new Error("playout didn't read every value");
      }
      // reached a solution
      const playout = buffer.finishPlayout();
      if (playout === undefined) {
        throw new Error("playout didn't close every span");
      }
      yield new Solution(val, playout);
    } catch (e) {
      if (!(e instanceof PlayoutFailed)) {
        throw e;
      }
      // backtracked from a dead end; try the next path
    }
    next = buffer.playNext();
  }
}
