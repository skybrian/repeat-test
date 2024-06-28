import { alwaysPickDefault } from "./picks.ts";
import {
  Playout,
  PlayoutContext,
  PlayoutFailed,
  PlayoutRecorder,
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
  ctx: PlayoutContext,
) => T;

export type Solution<T> = {
  readonly val: T;
  readonly playout: Playout;
};

/**
 * Visits every leaf in a search tree in order, depth-first. Starts with all
 * default picks.
 */
export function* generateAllSolutions<T>(
  runPlayout: PlayoutFunction<T>,
): Generator<Solution<T>> {
  const rec = new PlayoutRecorder(alwaysPickDefault);
  while (true) {
    try {
      const val = runPlayout(rec.startPlayout());
      const playout = rec.endPlayout();
      yield { val, playout };
    } catch (e) {
      if (!(e instanceof PlayoutFailed)) {
        throw e;
      }
      // backtracked from a dead end; try the next path
    }
    if (!rec.increment()) {
      // no more paths to try
      return;
    }
  }
}
