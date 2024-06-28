import { alwaysPickDefault } from "./picks.ts";
import {
  everyPlayout,
  Playout,
  PlayoutContext,
  PlayoutFailed,
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
  for (const ctx of everyPlayout(alwaysPickDefault)) {
    try {
      const val = runPlayout(ctx);
      const playout = ctx.getPlayout();
      yield { val, playout };
    } catch (e) {
      if (!(e instanceof PlayoutFailed)) {
        throw e;
      }
      // backtracked from a dead end; try the next path
    }
  }
}
