import type { Gen } from "./gen_class.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { removeRange, replacePick, trimStep } from "./edits.ts";
import { nullConsole } from "./console.ts";

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
  console = console ?? nullConsole;

  console.log("shrink:", seed.val);

  seed = shrinkTail(seed, test) ?? seed;
  console.log("after shrinkTail:", seed.val);

  seed = shrinkAllOptions(seed, test) ?? seed;
  console.log("after shrinkAllOptions:", seed.val);

  seed = shrinkAllPicks(seed, test) ?? seed;
  console.log("after shrinkAllPicks:", seed.val);

  return seed;
}

/**
 * Returns the new seed if the edit succeeded and passes the test.
 *
 * It could be the same value if the edit didn't change anything.
 */
function tryEdit<T>(
  editor: StepEditor,
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  const next = seed.mutate(editor);
  if (next === undefined || !test(next.val)) {
    return undefined;
  }
  return next;
}

function trimmedLength(seed: Gen<unknown>, key: StepKey): number {
  const picks = seed.getPicks(key);
  return picks === undefined ? 0 : picks.trimmedLength;
}

/**
 * Removes unnecessary picks from the end of the given step.
 *
 * Postcondition: the last pick is necessary, or the step has no picks left.
 */
function shrinkTailAt<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
  key: StepKey,
): Gen<T> | undefined {
  const len = trimmedLength(seed, key);
  assert(len > 0);

  // Try to remove the last pick to fail fast.
  const next = tryEdit(trimStep(key, len - 1), seed, test);
  if (next === undefined) {
    return undefined;
  }

  // Binary search to trim a range of unneeded picks at the end of the playout.
  // It might, by luck, jump to an earlier length that works.
  let tooLow = -1;
  let hi = seed.picks.trimmedLength;
  while (tooLow + 2 <= hi) {
    const mid = (tooLow + 1 + hi) >>> 1;
    assert(mid > tooLow && mid < hi);
    const next = tryEdit(trimStep(key, mid), seed, test);
    if (next === undefined) {
      // failed; retry with a higher length
      tooLow = mid;
      continue;
    }
    seed = next;
    hi = trimmedLength(seed, key);
  }
  return seed;
}

/**
 * Removes unnecessary picks from the end of a playout.
 *
 * Postcondition: the last pick in the last non-empty step is necessary, or
 * no steps have any picks.
 */
export function shrinkTail<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let keys = seed.stepKeys;
  let changed = false;
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i];
    if (trimmedLength(seed, key) === 0) {
      continue;
    }

    const next = shrinkTailAt(seed, test, i);
    if (next === undefined) {
      break;
    }
    seed = next;
    changed = true;
    keys = seed.stepKeys;
  }
  return changed ? seed : undefined;
}

/**
 * Shrinks the pick at the given offset.
 *
 * Postcondition: decrementing the pick by one would fail the test.
 */
export function shrinkOnePick(stepKey: StepKey, offset: number): Shrinker {
  return <T>(
    seed: Gen<T>,
    test: (val: T) => boolean,
  ): Gen<T> | undefined => {
    const picks = seed.getPicks(stepKey);
    if (picks === undefined) {
      return undefined;
    }

    if (picks.trimmedLength <= offset) {
      return undefined; // No change; nothing to shrink
    }

    const { req, reply } = picks.getPick(offset);
    if (reply === req.min) {
      return undefined; // No change; already at the minimum
    }

    // See if the test fails if we subtract one.
    const next = tryEdit(
      replacePick(stepKey, offset, reply - 1),
      seed,
      test,
    );
    if (next === undefined) {
      return undefined; // No change; the postcondition already holds
    }
    seed = next;
    let replies = seed.getPicks(stepKey)?.replies;
    if (replies === undefined) {
      return seed;
    }

    // Binary search to find the smallest pick that succeeds.
    let tooLow = req.min - 1;
    let hi = replies[offset];
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      const next = tryEdit(
        replacePick(stepKey, offset, mid),
        seed,
        test,
      );
      if (next === undefined) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      seed = next;
      replies = seed.getPicks(stepKey)?.replies;
      if (replies === undefined) {
        return seed;
      }
      hi = replies[offset];
    }
    return seed;
  };
}

/**
 * Attempts to shrink each pick in every step.
 *
 * Postcondition: reducing any pick by one would fail the test.
 */
export function shrinkAllPicks<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let changed = false;
  const seen = new Set<StepKey>();
  while (true) {
    const todo = seed.stepKeys.filter((key) => !seen.has(key));
    if (todo.length === 0) {
      break;
    }
    for (const key of todo) {
      for (
        let offset = 0; offset < (seed.getPicks(key)?.length ?? 0); offset++
      ) {
        const next = shrinkOnePick(key, offset)(seed, test);
        if (next !== undefined) {
          changed = true;
          seed = next;
        }
      }
      seen.add(key);
    }
  }

  return changed ? seed : undefined;
}

function shrinkSegmentOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
  stepKey: StepKey,
): Gen<T> | undefined {
  let picks = seed.getPicks(stepKey);
  if (picks == undefined) {
    return undefined;
  }
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
    let next = tryEdit(removeRange(stepKey, i, end), seed, test);
    if (next === undefined) {
      const containsEmptyOption = (end === i + 1) &&
        picks.getOption(end) === 0 &&
        picks.getOption(end + 1) !== undefined;

      if (!containsEmptyOption) {
        end = i;
        continue;
      }

      // Try extending the range to include an option that wasn't taken
      next = tryEdit(
        removeRange(stepKey, i, end + 1),
        seed,
        test,
      );
      if (next === undefined || !test(next.val)) {
        continue;
      }
    }

    seed = next;
    picks = seed.getPicks(stepKey);
    if (picks == undefined) {
      break;
    }
    end = i;
    changed = true;
  }

  return changed ? seed : undefined;
}

export function shrinkAllOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let changed = false;
  for (const key of seed.stepKeys) {
    const next = shrinkSegmentOptions(seed, test, key);
    if (next !== undefined) {
      seed = next;
      changed = true;
    }
  }
  return changed ? seed : undefined;
}
