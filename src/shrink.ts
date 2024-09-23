import { assert } from "@std/assert/assert";
import type { Generated, Playout } from "./generated.ts";
import type { IntEditor, PickRequest } from "./picks.ts";

/**
 * A function that shrinks a generated value if possible.
 * It returns undefined if no smaller value is available.
 */
type Shrinker = <T>(
  seed: Generated<T>,
  test: (val: T) => boolean,
) => Generated<T> | undefined;

/** Makes a shrinker from a function that chooses edits to try. */
function toShinker<T>(
  makeEdits: (playout: Playout) => Iterable<IntEditor>,
): Shrinker {
  return <T>(
    seed: Generated<T>,
    test: (val: T) => boolean,
  ): Generated<T> | undefined => {
    const edits = makeEdits(seed.trimmedPlayout());
    return mutate(seed, edits, test);
  };
}

/**
 * Applies each mutation until the test fails.
 * @returns the new value, or undefined if no change is available.
 */
function mutate<T>(
  seed: Generated<T>,
  edits: Iterable<IntEditor>,
  test: (val: T) => boolean,
): Generated<T> | undefined {
  let best: Generated<T> | undefined = undefined;
  for (const edit of edits) {
    const next = seed.mutate(edit);
    if (next === undefined || !test(next.val)) {
      return best;
    }
    best = next;
    seed = next;
  }
  return best;
}

/**
 * Given a generated value, returns a smaller one that satisfies a predicate.
 *
 * If no smaller value is found, returns the original value.
 */
export function shrink<T>(
  seed: Generated<T>,
  test: (arg: T) => boolean,
): Generated<T> {
  seed = shrinkTail(seed, test) ?? seed;
  while (true) {
    // Try each shrinker in order, until one works.
    let worked: Generated<T> | undefined = undefined;
    for (const shrinker of shrinkersToTry(seed)) {
      worked = shrinker(seed, test);
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

function* shrinkersToTry<T>(
  start: Generated<T>,
): Iterable<Shrinker> {
  const len = start.replies.length;
  yield* shrinkPicks(len);
  yield* shrinkOptions(len);
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
 * Removes unnecessary picks from the end of a playout.
 */
export function shrinkTail<T>(
  seed: Generated<T>,
  test: (val: T) => boolean,
): Generated<T> | undefined {
  const len = seed.trimmedPlayoutLength;
  if (len === 0) {
    return undefined; // Nothing to remove
  }

  // Try to remove the last pick to fail fast.
  const next = seed.mutate(trimEnd(len - 1));
  if (next === undefined || !test(next.val)) {
    return undefined;
  }

  // Binary search to find the shortest length that works.
  let tooLow = -1;
  let hi = seed.trimmedPlayoutLength;
  while (tooLow + 2 <= hi) {
    const mid = (tooLow + 1 + hi) >>> 1;
    assert(mid > tooLow && mid < hi);
    const next = seed.mutate(trimEnd(mid));
    if (next === undefined || !test(next.val)) {
      // failed; retry with a higher length
      tooLow = mid;
      continue;
    }
    seed = next;
    hi = seed.trimmedPlayoutLength;
  }
  return seed;
}

/**
 * Returns shrinkers that try to shrink each pick in the playout.
 *
 * Returns the strategies to try. Each shrinker assumes that the previous one
 * failed.
 */
function* shrinkPicks(pickCount: number): Iterable<Shrinker> {
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
 * Returns shrinkers that shrink individual picks.
 *
 * Each shrinker starts by shrinking the pick at the given index by one. If that
 * works, it tries repeatedly doubling the amount removed. Finally, tries
 * setting the entire pick to the minimum.
 *
 * If that works, tries again with the next pick, for the rest of the playout.
 *
 * @param start The index of the first pick to shrink.
 */
export function shrinkPicksFrom(
  start: number,
): Shrinker {
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
  return toShinker(shrinkPicks);
}

function* shrinkOptions(pickCount: number): Iterable<Shrinker> {
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
 * Returns shrinkers that shrink options.
 *
 * An option is two or more picks, starting with a bit that's set to 1.
 *
 * @param limit the index beyond which the playout should be preserved.
 */
export function shrinkOptionsUntil(limit: number): Shrinker {
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
        yield deleteRange(start, end);
        end = start;
      }
    }
  }
  return toShinker(shrinkOptions);
}
