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
  seed = shrinkAllOptions(seed, test) ?? seed;
  seed = shrinkAllPicks(seed, test) ?? seed;
  return seed;
}

/**
 * Edits a playout by removing picks from the end (forcing them to be the minimum).
 */
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
  for (let i = 0; i < len; i++) {
    const next = shrinkOnePick(i)(seed, test);
    if (next !== undefined && test(next.val)) {
      changed = true;
      seed = next;
    }
  }

  return changed ? seed : undefined;
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

function isOption({ reqs, replies }: Playout, i: number): boolean {
  const req = reqs[i];
  return req.min === 0 && req.max === 1 && replies[i] === 1;
}

export function shrinkAllOptions<T>(
  seed: Generated<T>,
  test: (val: T) => boolean,
): Generated<T> | undefined {
  const len = seed.trimmedPlayoutLength;

  if (len < 2) {
    return undefined; // No options to remove
  }

  let changed = false;
  let end = len;
  for (let i = len - 2; i >= 0; i--) {
    if (!isOption(seed, i)) {
      continue;
    }
    const next = seed.mutate(deleteRange(i, end));
    if (next === undefined || !test(next.val)) {
      end = i;
      continue;
    }

    seed = next;
    end = i;
    changed = true;
  }

  return changed ? seed : undefined;
}
