import { playback } from "./backtracking.ts";
import { generate, type Generated, type Playout } from "./generated.ts";
import type { Arbitrary } from "./arbitrary_class.ts";

/**
 * Provides increasingly smaller guesses for how to shrink a value.
 *
 * Each guess assumes that the previous guess worked.
 */
interface Strategy {
  label: string;
  guesses(gen: Playout): Iterable<number[]>;
}

/**
 * Given a generated value, returns a possibly smaller one that satisfies a
 * predicate.
 *
 * If no smaller value is found, returns the original value.
 */
export function shrink<T>(
  arb: Arbitrary<T>,
  interesting: (arg: T) => boolean,
  start: Generated<T>,
): Generated<T> {
  while (true) {
    // Try each strategy in order, until one works.
    let worked: Generated<T> | undefined = undefined;
    for (const strategy of strategiesToTry(start)) {
      worked = runStrategy(arb, interesting, start, strategy);
      if (worked) {
        break; // Restarting
      }
    }
    if (!worked) {
      return start; // No strategies work anymore
    }
    start = worked; // Try to shrink again with the smaller value
  }
}

function* strategiesToTry<T>(
  start: Generated<T>,
): Iterable<Strategy> {
  yield { label: "shrinkLength", guesses: shrinkLength };
  const len = start.replies.length;
  yield* shrinkPicks(len);
  yield* shrinkOptions(len);
}

function runStrategy<T>(
  arb: Arbitrary<T>,
  interesting: (arg: T) => boolean,
  start: Generated<T>,
  strategy: Strategy,
): Generated<T> | undefined {
  let worked: Generated<T> | undefined = undefined;
  for (const guess of strategy.guesses(start)) {
    const shrunk = generate(arb, playback(guess));
    if (!shrunk || !interesting(shrunk.val)) {
      return worked;
    }
    worked = shrunk;
  }
  return worked;
}

function trimZeroes({ reqs, replies }: Playout): Playout {
  let last = replies.length - 1;
  while (last >= 0 && replies[last] === reqs[last].min) {
    last--;
  }
  return {
    reqs: reqs.slice(0, last + 1),
    replies: replies.slice(0, last + 1),
  };
}

/**
 * A strategy that tries removing suffixes from a playout.
 *
 * First tries removing the last pick. If that works, tries doubling the number
 * of picks to remove. Finally, tries removing the entire playout.
 */
export function* shrinkLength(playout: Playout): Iterable<number[]> {
  playout = trimZeroes(playout);
  const len = playout.replies.length;
  if (len === 0) {
    return;
  }
  let delta = 1;
  let guess = len - delta;
  while (guess > 0) {
    yield playout.replies.slice(0, guess);
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
function* shrinkPicks(pickCount: number): Iterable<Strategy> {
  for (let i = 0; i < pickCount; i++) {
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
  function* shrinkPicks(
    playout: Playout,
  ): Iterable<number[]> {
    const { reqs, replies } = trimZeroes(playout);
    for (let i = start; i < reqs.length; i++) {
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
  return { label: "shrinkPicks", guesses: shrinkPicks };
}

function* shrinkOptions(pickCount: number): Iterable<Strategy> {
  for (let i = pickCount; i >= 0; i--) {
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
  function* shrinkOptions(
    playout: Playout,
  ): Iterable<number[]> {
    const { reqs, replies } = trimZeroes(playout);
    const len = replies.length;

    function isBit(i: number, expected?: number): boolean {
      const req = reqs[i];
      if (req.min !== 0 || req.max !== 1) {
        return false;
      }
      return expected === replies[i];
    }

    let end = limit > len ? len : limit;
    for (let start = end - 2; start >= 0; start -= 1) {
      if (isBit(start, 1)) {
        reqs.splice(start, end - start);
        replies.splice(start, end - start);
        yield replies.slice();
        end = start;
      }
    }
  }
  return { label: "shrinkOptions", guesses: shrinkOptions };
}
