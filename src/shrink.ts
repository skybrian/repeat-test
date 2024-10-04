import type { Edit } from "./edits.ts";
import type { Gen } from "./gen_class.ts";

import { keep, replace, snip, type StreamEditor } from "./edits.ts";

import { assert } from "@std/assert/assert";

/**
 * A function that shrinks a generated value if possible.
 * It returns undefined if no smaller value is available.
 */
type Shrinker = <T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
) => Gen<T> | undefined;

/**
 * Given a generated value, returns a smaller one that satisfies a predicate.
 *
 * If no smaller value is found, returns the original value.
 */
export function shrink<T>(
  seed: Gen<T>,
  test: (arg: T) => boolean,
): Gen<T> {
  seed = shrinkTail(seed, test) ?? seed;
  seed = shrinkAllOptions(seed, test) ?? seed;
  seed = shrinkAllPicks(seed, test) ?? seed;
  return seed;
}

/**
 * Edits a playout by removing picks from the end (forcing them to be the minimum).
 */
function trimEnd(len: number): StreamEditor {
  let reqs = 0;
  return {
    replace(): Edit {
      if (reqs >= len) {
        return snip();
      }
      reqs++;
      return keep();
    },
  };
}

/**
 * Removes unnecessary picks from the end of a playout.
 * Postcondition: the last pick in the playout is necessary.
 */
export function shrinkTail<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  const len = seed.picks.trimmedLength;
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
  let hi = seed.picks.trimmedLength;
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
    hi = seed.picks.trimmedLength;
  }
  return seed;
}

function replaceAt(
  index: number,
  replacement: number,
): StreamEditor {
  let reqs = 0;
  return {
    replace(): Edit {
      if (reqs === index) {
        reqs++;
        return replace(replacement);
      }
      reqs++;
      return keep();
    },
  };
}

/**
 * Shrinks the pick at the given offset.
 * Postcondition: decrementing the pick by one would fail the test.
 */
export function shrinkOnePick(index: number): Shrinker {
  return <T>(
    seed: Gen<T>,
    test: (val: T) => boolean,
  ): Gen<T> | undefined => {
    const picks = seed.picks;
    if (picks.trimmedLength <= index) {
      return undefined; // No change; nothing to shrink
    }

    const { req, reply } = picks.getPick(index);
    if (reply === req.min) {
      return undefined; // No change; already at the minimum
    }

    // See if the test fails if we substract one.
    const next = seed.mutate(replaceAt(index, reply - 1));
    if (next === undefined || !test(next.val)) {
      return undefined; // No change; the postcondition already holds
    }
    seed = next;
    let replies = seed.replies;

    // Binary search to find the smallest pick that succeeds.
    let tooLow = req.min - 1;
    let hi = replies[index];
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
      replies = seed.replies;
      hi = replies[index];
    }
    return seed;
  };
}

export function shrinkAllPicks<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  const len = seed.picks.trimmedLength;

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

function deleteRange(start: number, end: number): StreamEditor {
  let reqs = 0;
  return {
    replace(): Edit {
      if (reqs < start || reqs >= end) {
        reqs++;
        return keep();
      }
      reqs++;
      return snip();
    },
  };
}

export function shrinkAllOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let picks = seed.picks;
  const len = picks.trimmedLength;

  if (len < 1) {
    return undefined; // No options to remove
  }

  let changed = false;
  let end = len;
  for (let i = len - 1; i >= 0; i--) {
    const val = picks.getOption(i);
    if (val === undefined) {
      continue;
    } else if (val === 0) {
      // Try deleting it by itself.
      end = i + 1;
    }
    let next = seed.mutate(deleteRange(i, end));
    if (next === undefined || !test(next.val)) {
      const containsEmptyOption = (end === i + 1) &&
        picks.getOption(end) === 0 &&
        picks.getOption(end + 1) !== undefined;

      if (!containsEmptyOption) {
        end = i;
        continue;
      }

      // Try extending the range to include an option that wasn't taken
      next = seed.mutate(deleteRange(i, end + 1));
      if (next === undefined || !test(next.val)) {
        continue;
      }
    }

    seed = next;
    picks = seed.picks;
    end = i;
    changed = true;
  }

  return changed ? seed : undefined;
}
