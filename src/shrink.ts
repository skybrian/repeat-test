import type { Gen, Playout } from "./gen_class.ts";
import type { IntEditor, PickRequest } from "./picks.ts";
import type { SystemConsole } from "./console.ts";

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
  console?: SystemConsole,
): Gen<T> {
  seed = shrinkTail(seed, test) ?? seed;
  seed = shrinkAllOptions(seed, test, console) ?? seed;
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
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
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
    seed: Gen<T>,
    test: (val: T) => boolean,
  ): Gen<T> | undefined => {
    if (seed.trimmedPlayoutLength <= index) {
      return undefined; // No change; nothing to shrink
    }

    const { reqs, replies } = seed.playout;
    const min = reqs[index].min;
    if (replies[index] === min) {
      return undefined; // No change; already at the minimum
    }

    // See if the test fails if we substract one.
    const next = seed.mutate(replaceAt(index, replies[index] - 1));
    if (next === undefined || !test(next.val)) {
      return undefined; // No change; the postcondition already holds
    }
    seed = next;

    // Binary search to find the smallest pick that succeeds.
    let tooLow = min - 1;
    let hi = seed.playout.replies[index];
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
      hi = seed.playout.replies[index];
    }
    return seed;
  };
}

export function shrinkAllPicks<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
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

function getOption({ reqs, replies }: Playout, i: number): number | undefined {
  if (i >= reqs.length) {
    return undefined;
  }
  const req = reqs[i];
  if (req.min !== 0 || req.max !== 1) {
    return undefined;
  }
  return replies[i];
}

export function shrinkAllOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
  console?: SystemConsole,
): Gen<T> | undefined {
  if (console) {
    console.log("shrinkAllOptions:", seed.val);
    const { reqs, replies } = seed.playout;
    for (let i = 0; i < reqs.length; i++) {
      const req = reqs[i];
      const reply = replies[i];
      console.log(` ${i}: ${req.min}..${req.max} =>`, reply);
    }
  }
  const len = seed.trimmedPlayoutLength;

  if (len < 1) {
    return undefined; // No options to remove
  }

  let changed = false;
  let end = len;
  for (let i = len - 1; i >= 0; i--) {
    const val = getOption(seed.playout, i);
    if (val === undefined) {
      continue;
    } else if (val === 0) {
      // Try deleting it by itself.
      end = i + 1;
    }
    let next = seed.mutate(deleteRange(i, end));
    if (next === undefined || !test(next.val)) {
      if (console) {
        console.log("needed", i, end, seed.playout.replies.slice(i, end));
      }

      const containsEmptyOption = (end === i + 1) &&
        getOption(seed.playout, end) === 0 &&
        getOption(seed.playout, end + 1) !== undefined;

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
    if (console) {
      console.log("removed:", i, end, seed.playout.replies.slice(i, end));
    }

    seed = next;
    end = i;
    changed = true;
  }

  return changed ? seed : undefined;
}
