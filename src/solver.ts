import { alwaysPickDefault, PickFailed } from "./picks.ts";
import { everyPlayout, Playout, PlayoutContext } from "./playouts.ts";

/**
 * A function defining a search tree that optionally has a value at each leaf.
 *
 * On each function call, it walks the search tree from the root to a leaf and
 * returns whatever value is found there. If there's no value to be returned, it
 * can throw {@link PickFailed} to indicate a dead end, and the caller will
 * try again.
 *
 * During a function call, calls to {@link PlayoutContext.pick} extend the
 * search tree. For example, the argument to the first pick() call on the first
 * iteration defines the root, and the reply tells the function which child to
 * visit next. Other children may be visited on future calls.
 *
 * On subsequent calls, the first pick call (for the root) must have the same
 * range as the previous iteration (since the root has already been defined). If
 * not, pick() will throw an exception. Similarly for all subsequent picks up to
 * an unexplored part of the tree.
 *
 * The easiest way to do this is to make the PlayoutTree function deterministic.
 * Each call to pick() should be determined only be the previous picks.
 */
export type PlayoutTree<T> = (
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
  runPlayout: PlayoutTree<T>,
): Generator<Solution<T>> {
  for (const ctx of everyPlayout(alwaysPickDefault)) {
    try {
      const val = runPlayout(ctx);
      const playout = ctx.toPlayout();
      yield { val, playout };
    } catch (e) {
      if (!(e instanceof PickFailed)) {
        throw e;
      }
      // backtracked from a dead end; try the next path
    }
  }
}
