import type { Gen } from "./gen_class.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { removeRange, replaceOnce, trimGroup } from "./edits.ts";
import { nullConsole } from "./console.ts";
import { MutableGen } from "./gen_class.ts";

export type ShrinkAttempt =
  | { kind: "edit"; edits: MultiEdit }
  | { kind: "delete"; start: number; end: number };

type Steps<R> = Generator<ShrinkAttempt, R, boolean>;

class ShrinkSearch<T> {
  readonly seed: MutableGen<T>;
  private readonly console: SystemConsole;
  constructor(seed: Gen<T>, console?: SystemConsole) {
    this.seed = MutableGen.from(seed);
    this.console = console ?? nullConsole;
  }

  /** The same sequence of decisions as the synchronous shrinker. */
  *steps(): Steps<Gen<T>> {
    yield* this.removeGroupsSteps();
    yield* this.shrinkTailsSteps();
    yield* this.shrinkAllOptionsSteps();
    yield* this.shrinkAllPicksSteps();
    return this.seed.gen;
  }

  trimmedLength(key: GroupKey): number {
    return this.seed.picksAt(key).trimmedLength;
  }

  /**
   * Removes leading and trailing groups.
   */
  private *removeGroupsSteps(): Steps<boolean> {
    const startSize = this.seed.groupKeys.length;
    yield* this.removeTailGroupsSteps(0, this.seed.groupKeys.length);
    yield* this.removeHeadGroupsSteps(this.seed.groupKeys.length - 1);
    return this.seed.groupKeys.length < startSize;
  }

  /**
   * Attempts to remove the given number of groups from the start of the group keys.
   *
   * Returns the number actually removed.
   */
  private *removeHeadGroupsSteps(goal: number): Steps<number> {
    this.console.log(
      "removeHeadGroups goal:",
      goal,
      "val:",
      this.seed.val,
    );

    let removed = 0;
    while (goal > 0) {
      if ((yield { kind: "delete", start: 0, end: goal })) {
        // goal achieved
        removed += goal;
        return removed;
      }

      // reduce goal; can't remove them all
      goal--;

      const halfGoal = Math.floor(goal / 2);
      if (halfGoal > 0 && halfGoal < goal) {
        const actual = yield* this.removeHeadGroupsSteps(halfGoal);
        removed += actual;
        if (actual < halfGoal) {
          // Was unable to remove half.
          return removed;
        }
      }

      // tail recurse to remove the other half
      goal -= halfGoal;
    }

    return removed;
  }

  /**
   * Removes unneeded groups from the end of the given range.
   *
   * Returns the number of remaining groups.
   */
  private *removeTailGroupsSteps(start: number, end: number): Steps<number> {
    this.console.log(
      "removeTailGroups start:",
      start,
      "end:",
      end,
      "val:",
      this.seed.val,
    );

    while (true) {
      if ((yield { kind: "delete", start, end })) {
        return 0; // removed everything.
      }

      const len = end - start;
      if (len <= 1) {
        return len; // remaining group can't be removed.
      }

      const half = Math.floor(len / 2);
      const remaining = yield* this.removeTailGroupsSteps(start + half, end);
      if (remaining !== 0) {
        return half + remaining; // nothing more to do
      }

      // tail recurse to remove first half
      end = start + half;
      this.console.log(
        "removeTailGroups loop start:",
        start,
        "end:",
        end,
        "val:",
        this.seed.val,
      );
    }
  }

  /**
   * Removes unnecessary picks from the end of each group.
   *
   * Postcondition: the last pick in each group is necessary, or the group has a
   * length <= 2. (Very short groups are handled elsewhere.)
   */
  private *shrinkTailsSteps(): Steps<boolean> {
    let keys = this.seed.groupKeys;
    this.console?.log("shrinkTails keys:", keys);
    let changed = false;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (this.trimmedLength(key) <= 2) {
        continue;
      }

      if (yield* this.shrinkTailAtSteps(key)) {
        changed = true;
      }
      keys = this.seed.groupKeys;
    }
    return changed;
  }

  /**
   * Removes unnecessary picks from the end of the given group.
   *
   * Postcondition: the last pick is necessary, or the group has no picks left.
   */
  private *shrinkTailAtSteps(
    key: GroupKey,
  ): Steps<boolean> {
    this.console.log("shrinkTailAt:", key);
    const len = this.trimmedLength(key);
    assert(len > 0);

    // Try to remove the last pick to fail fast.
    if (!(yield { kind: "edit", edits: trimGroup(key, len - 1) })) {
      return false;
    }

    // Binary search to trim a range of unneeded picks at the end of the playout.
    // It might, by luck, jump to an earlier length that works.
    let tooLow = -1;
    let hi = this.trimmedLength(key);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!(yield { kind: "edit", edits: trimGroup(key, mid) })) {
        // failed; retry with a higher length
        tooLow = mid;
        continue;
      }
      hi = this.trimmedLength(key);
    }
    return true;
  }

  private *shrinkAllOptionsSteps(): Steps<boolean> {
    let changed = false;
    for (const key of this.seed.groupKeys) {
      if (yield* this.shrinkSegmentOptionsSteps(key)) {
        changed = true;
      }
    }
    return changed;
  }

  private *shrinkSegmentOptionsSteps(key: GroupKey): Steps<boolean> {
    let picks = this.seed.picksAt(key);
    const len = picks.trimmedLength;

    if (len < 1) {
      return false; // No options to remove
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
      if (!(yield { kind: "edit", edits: removeRange(key, i, end) })) {
        const containsEmptyOption = (end === i + 1) &&
          picks.getOption(end) === 0 &&
          picks.getOption(end + 1) !== undefined;

        if (!containsEmptyOption) {
          end = i;
          continue;
        }

        // Try extending the range to include an option that wasn't taken
        if ((yield { kind: "edit", edits: removeRange(key, i, end + 1) })) {
          continue;
        }
      }

      picks = this.seed.picksAt(key);
      end = i;
      changed = true;
    }

    return changed;
  }

  /**
   * Attempts to set each pick to the lowest possible value in every group.
   *
   * Postcondition: reducing any pick by one would fail the test.
   */
  private *shrinkAllPicksSteps(): Steps<boolean> {
    let changed = false;
    for (const key of this.seed.groupKeys) {
      for (
        let offset = 0;
        offset < this.seed.picksAt(key).length;
        offset++
      ) {
        if (yield* this.shrinkOnePickSteps(key, offset)) {
          changed = true;
        }
      }
    }

    return changed;
  }

  /**
   * Shrinks the pick at the given offset.
   *
   * Postcondition: decrementing the pick by one would fail the test.
   */
  private *shrinkOnePickSteps(
    key: GroupKey,
    offset: number,
  ): Steps<boolean> {
    const diff = this.seed.picksAt(key).diffAt(offset);
    if (diff === 0) {
      return false; // No change; already at the minimum
    }

    // See if the test fails if we subtract one.
    if (!(yield { kind: "edit", edits: replaceOnce(key, offset, diff - 1) })) {
      return false; // No change; the postcondition already holds
    }

    // Binary search to find the smallest pick that succeeds.
    let tooLow = -1;
    let hi = this.seed.picksAt(key).diffAt(offset);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!(yield { kind: "edit", edits: replaceOnce(key, offset, mid) })) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      hi = this.seed.picksAt(key).diffAt(offset);
    }
    return true;
  }
}

/** Shrinks with a predicate that may finish synchronously or asynchronously. */
export function shrinkMaybeAsync<T>(
  seed: Gen<T>,
  test: (arg: T) => boolean | PromiseLike<boolean>,
  console?: SystemConsole,
): Gen<T> | Promise<Gen<T>> {
  const search = new ShrinkSearch(seed, console);
  const steps = search.steps();
  const decide = (attempt: ShrinkAttempt): boolean | Promise<boolean> => {
    const candidate = attempt.kind === "edit"
      ? search.seed.prepareEdits(attempt.edits)
      : search.seed.prepareDeleteRange(attempt.start, attempt.end);
    if (candidate.kind === "filtered") return false;
    if (candidate.kind === "unchanged") return true;
    const accept = (passed: boolean) => {
      if (passed) candidate.commit();
      return passed;
    };
    const verdict = test(candidate.val);
    return isPromiseLike(verdict)
      ? Promise.resolve(verdict).then(accept)
      : accept(verdict);
  };

  const continueAsync = async (pending: Promise<boolean>): Promise<Gen<T>> => {
    let accepted = await pending;
    let next = steps.next(accepted);
    while (!next.done) {
      accepted = await decide(next.value);
      next = steps.next(accepted);
    }
    return next.value;
  };

  let next = steps.next();
  while (!next.done) {
    const accepted = decide(next.value);
    if (isPromiseLike(accepted)) {
      return continueAsync(Promise.resolve(accepted));
    }
    next = steps.next(accepted);
  }
  return next.value;
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<T>).then === "function";
}

/** Shrinks with a predicate whose result may need to be awaited. */
export async function shrinkAsync<T>(
  seed: Gen<T>,
  test: (arg: T) => boolean | PromiseLike<boolean>,
  console?: SystemConsole,
): Promise<Gen<T>> {
  return await shrinkMaybeAsync(seed, test, console);
}
