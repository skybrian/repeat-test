import type { Generated, Playout } from "./generated.ts";
import type { IntEditor, PickRequest } from "./picks.ts";

/**
 * Provides increasingly smaller guesses for how to shrink a value.
 *
 * Each guess assumes that the previous guess worked.
 */
interface Strategy {
  label: string;
  edits(gen: Playout): Iterable<IntEditor>;
}

/**
 * Given a generated value, returns a smaller one that satisfies a predicate.
 *
 * If no smaller value is found, returns the original value.
 */
export function shrink<T>(
  seed: Generated<T>,
  interesting: (arg: T) => boolean,
): Generated<T> {
  while (true) {
    // Try each strategy in order, until one works.
    let worked: Generated<T> | undefined = undefined;
    for (const strategy of strategiesToTry(seed)) {
      worked = runStrategy(interesting, seed, strategy);
      if (worked) {
        break; // Restarting
      }
    }
    if (!worked) {
      return seed; // No strategies work anymore
    }
    seed = worked; // Try to shrink again with the smaller value
  }
}

function* strategiesToTry<T>(
  start: Generated<T>,
): Iterable<Strategy> {
  yield { label: "shrinkLength", edits: shrinkLength };
  const len = start.replies.length;
  yield* shrinkPicks(len);
  yield* shrinkOptions(len);
}

function runStrategy<T>(
  interesting: (arg: T) => boolean,
  seed: Generated<T>,
  strategy: Strategy,
): Generated<T> | undefined {
  let best: Generated<T> | undefined = undefined;
  for (const edit of strategy.edits(seed.trimmedPlayout())) {
    const shrunk = seed.mutate(edit);
    if (!shrunk || !interesting(shrunk.val)) {
      return best;
    }
    best = shrunk;
  }
  return best;
}

function trimEnd(len: number): IntEditor {
  let reqs = 0;
  return {
    replace(_: PickRequest, before: number): number | undefined {
      if (reqs >= len) {
        return undefined;
      }
      reqs++;
      return before;
    },
  };
}

/**
 * A strategy that tries removing suffixes from a playout.
 *
 * First tries removing the last pick. If that works, tries doubling the number
 * of picks to remove. Finally, tries removing the entire playout.
 */
export function* shrinkLength({ reqs, replies }: Playout): Iterable<IntEditor> {
  const len = replies.length;
  if (len === 0) {
    return;
  }

  let delta = 1;
  let guess = len - delta;

  function endIsMin() {
    return guess > 0 && replies[guess - 1] === reqs[guess - 1].min;
  }

  while (guess > 0) {
    while (endIsMin()) {
      guess--;
    }
    if (guess === 0) {
      break;
    }
    yield trimEnd(guess);
    delta *= 2;
    guess = Math.min(len - delta, guess - 1);
  }
  yield trimEnd(0);
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

function replaceAt(
  start: number,
  replacement: number[],
): IntEditor {
  let reqs = 0;
  return {
    replace(_: PickRequest, before: number): number | undefined {
      if (reqs < start || reqs >= start + replacement.length) {
        reqs++;
        return before;
      }
      return replacement[reqs++ - start];
    },
  };
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
    { reqs, replies }: Playout,
  ): Iterable<IntEditor> {
    const replacement: number[] = [];
    for (let i = start; i < reqs.length; i++) {
      const min = reqs[i].min;
      const reply = replies[i];
      if (reply === min) {
        replacement[i - start] = min;
        continue;
      }
      let delta = 1;
      let guess = reply - delta;
      while (guess > min) {
        replacement[i - start] = guess;
        yield replaceAt(start, replacement.slice());
        delta *= 2;
        guess = reply - delta;
      }
      replacement[i - start] = min;
      yield replaceAt(start, replacement.slice());
    }
  }
  return { label: "shrinkPicks", edits: shrinkPicks };
}

function* shrinkOptions(pickCount: number): Iterable<Strategy> {
  for (let i = pickCount; i >= 0; i--) {
    yield shrinkOptionsUntil(i);
  }
}

function deleteRange(start: number, end: number): IntEditor {
  let reqs = 0;
  return {
    replace(_: PickRequest, before: number): number | undefined {
      if (reqs < start || reqs >= end) {
        reqs++;
        return before;
      }
      reqs++;
      return undefined;
    },
  };
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
    { reqs, replies }: Playout,
  ): Iterable<IntEditor> {
    const len = replies.length;

    function isBit(i: number, expected?: number): boolean {
      const req = reqs[i];
      if (req.min !== 0 || req.max !== 1) {
        return false;
      }
      return expected === replies[i];
    }

    limit = Math.min(limit, len);
    let end = limit;
    for (let start = end - 2; start >= 0; start -= 1) {
      if (isBit(start, 1)) {
        yield deleteRange(start, limit);
        end = start;
      }
    }
  }
  return { label: "shrinkOptions", edits: shrinkOptions };
}
