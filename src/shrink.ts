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
  yield shrinkAllPicks;
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
 * Postcondition: the last pick in the playout is necessary.
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

  // Binary search to trim a range of unneeded picks at the end of the playout.
  // It might, by luck, jump to an earlier length that works.
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

function replaceAt(
  index: number,
  replacement: number,
): IntEditor {
  let reqs = 0;
  return {
    replace(_: PickRequest, before: number): number | undefined {
      if (reqs === index) {
        reqs++;
        return replacement;
      }
      reqs++;
      return before;
    },
  };
}

/**
 * Shrinks the pick at the given offset.
 * Postcondition: decrementing the pick by one would fail the test.
 */
export function shrinkOnePick(index: number): Shrinker {
  return <T>(
    seed: Generated<T>,
    test: (val: T) => boolean,
  ): Generated<T> | undefined => {
    if (seed.trimmedPlayoutLength <= index) {
      return undefined; // No change; nothing to shrink
    }

    const min = seed.reqs[index].min;
    if (seed.replies[index] === min) {
      return undefined; // No change; already at the minimum
    }

    // See if the test fails if we substract one.
    const next = seed.mutate(replaceAt(index, seed.replies[index] - 1));
    if (next === undefined || !test(next.val)) {
      return undefined; // No change; the postcondition already holds
    }
    seed = next;

    // Binary search to find the smallest pick that succeeds.
    let tooLow = min - 1;
    let hi = seed.replies[index];
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      const next = seed.mutate(replaceAt(index, mid));
      if (next === undefined || !test(next.val)) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      seed = next;
      hi = seed.replies[index];
    }
    return seed;
  };
}

export function shrinkAllPicks<T>(
  seed: Generated<T>,
  test: (val: T) => boolean,
): Generated<T> | undefined {
  const len = seed.trimmedPlayoutLength;

  let changed = false;
  for (let i = len - 1; i >= 0; i--) {
    const next = shrinkOnePick(i)(seed, test);
    if (next !== undefined && test(next.val)) {
      changed = true;
      seed = next;
    }
  }

  return changed ? seed : undefined;
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
