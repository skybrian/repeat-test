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
  /** Tries to shrink a solution using guesses from the given strategy. */
  function tryStrategy(
    start: Solution<T>,
    strategy: Strategy,
  ): Solution<T> {
    let best = start;
    for (const guess of strategy(start.playout.picks)) {
      const picker = new PlaybackPicker(guess);
      const picked = arb.pickSolution(onePlayout(picker));
      if (!picked || !interesting(picked.val)) {
        break;
      }
      best = picked;
    }
    return best;
  }

  // Try each way of shrinking until no rule applies.
  while (true) {
    let best = start;
    for (const strategy of [shrinkLength, shrinkStartingPicks]) {
      best = tryStrategy(best, strategy);
    }
    const oldPicks = start.playout.picks;
    const newPicks = best.playout.picks;
    if (PickList.equalPicks(oldPicks, newPicks)) {
      return best;
    }
    start = best;
  }
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
 * A strategy that tries shrinking each pick, one at a time.
 *
 * Starts by shrinking the first pick by one. If that works, tries doubling the
 * amount removed. Finally, tries setting the entire pick to the minimum.
 *
 * If that works, tries again with the second pick, and so on.
 */
export function* shrinkStartingPicks(
  picks: PickList,
): Iterable<number[]> {
  picks.trim();
  const len = picks.length;
  const reqs = picks.reqs;
  const replies = picks.replies;
  for (let i = 0; i < len; i++) {
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
