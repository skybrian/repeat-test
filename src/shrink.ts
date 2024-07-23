import { PickList, PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import Arbitrary, { Solution } from "./arbitrary_class.ts";

/**
 * A shrink strategy provides increasingly smaller guesses for shrinking a solution.
 *
 * Each guess assumes that the previous guess was correct.
 */
type Strategy = (picks: PickList) => Iterable<number[]>;

/**
 * Given a playout from an arbitrary, returns a smaller solution that satisfies a predicate.
 */
export function shrink<T>(
  arb: Arbitrary<T>,
  interesting: (arg: T) => boolean,
  start: Solution<T>,
): Solution<T> {
  while (true) {
    // Try each strategy in order, until one works.
    let worked: Solution<T> | undefined = undefined;
    for (const strategy of strategiesToTry(start)) {
      worked = runStrategy(arb, interesting, start, strategy);
      if (worked) {
        break; // Restarting
      }
    }
    if (!worked) {
      return start; // No strategies work anymore
    }
    start = worked; // Restart with the better solution
  }
}

function* strategiesToTry<T>(
  start: Solution<T>,
): Iterable<Strategy> {
  yield shrinkLength;
  yield* shrinkPicks(start.playout.picks);
  yield* shrinkOptions(start.playout.picks);
}

function runStrategy<T>(
  arb: Arbitrary<T>,
  interesting: (arg: T) => boolean,
  start: Solution<T>,
  strategy: Strategy,
): Solution<T> | undefined {
  let worked: Solution<T> | undefined = undefined;
  for (const guess of strategy(start.playout.picks)) {
    const picker = new PlaybackPicker(guess);
    const shrunk = arb.pickSolution(onePlayout(picker));
    if (!shrunk || !interesting(shrunk.val)) {
      return worked;
    }
    worked = shrunk;
  }
  return worked;
}

/**
 * A strategy that tries removing suffixes from a playout.
 *
 * First tries removing the last pick. If that works, tries doubling the number
 * of picks to remove. Finally, tries removing the entire playout.
 */
export function* shrinkLength(
  picks: PickList,
): Iterable<number[]> {
  const replies = picks.trim().replies;
  const len = replies.length;
  if (len === 0) {
    return;
  }
  let delta = 1;
  let guess = len - delta;
  while (guess > 0) {
    yield replies.slice(0, guess);
    delta *= 2;
    guess = len - delta;
  }
  yield [];
}

/**
 * Returns a family of strategies that try to shrink each pick in the playout.
 *
 * Returns the strategies to try. Each strategy assumes that the previous one
 * failed.
 */
function* shrinkPicks(picks: PickList): Iterable<Strategy> {
  const len = picks.length;
  for (let i = 0; i < len; i++) {
    yield shrinkPicksFrom(i);
  }
}

/**
 * A family of strategies that shrink individual picks.
 *
 * Each strategy starts by shrinking the pick at the given index by one. If that
 * works, it tries repeatedly doubling the amount removed. Finally, tries
 * setting the entire pick to the minimum.
 *
 * If that works, tries again with the next pick, for the rest of the playout.
 *
 * @param start The index of the first pick to shrink.
 */
export function shrinkPicksFrom(
  start: number,
): Strategy {
  function* shrink(
    picks: PickList,
  ): Iterable<number[]> {
    picks = picks.trim();
    const len = picks.length;
    const reqs = picks.reqs;
    const replies = picks.replies;
    for (let i = start; i < len; i++) {
      const min = reqs[i].min;
      const reply = replies[i];
      if (reply === min) {
        continue;
      }
      let delta = 1;
      let guess = reply - delta;
      while (guess > min) {
        replies[i] = guess;
        yield replies.slice();
        delta *= 2;
        guess = reply - delta;
      }
      replies[i] = min;
      yield replies.slice();
    }
  }
  return shrink;
}

function* shrinkOptions(picks: PickList): Iterable<Strategy> {
  for (let i = picks.length; i >= 0; i--) {
    yield shrinkOptionsUntil(i);
  }
}

/**
 * A family of strategies that shrink options.
 *
 * An option is two or more picks, starting with a bit that's set to 1.
 *
 * @param limit the index beyond which the playout should be preserved.
 */
export function shrinkOptionsUntil(limit: number): Strategy {
  function* shrink(
    picks: PickList,
  ): Iterable<number[]> {
    picks = picks.trim();

    let end = limit > picks.length ? picks.length : limit;
    for (let start = end - 2; start >= 0; start -= 1) {
      if (picks.isBit(start, 1)) {
        picks.splice(start, end - start);
        yield picks.replies;
        end = start;
      }
    }
  }
  return shrink;
}
