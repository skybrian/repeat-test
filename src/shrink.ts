import type { Gen, MutableGen } from "./gen_class.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { removeRange, replaceOnce, trimGroup } from "./edits.ts";
import { nullConsole } from "./console.ts";

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
  return new Shrinker(seed, test, console).shrink();
}

export class Shrinker<T> {
  readonly seed: MutableGen<T>;
  private readonly console: SystemConsole;
  #tries = 0;

  constructor(
    seed: Gen<T>,
    private readonly test: (arg: T) => boolean,
    console?: SystemConsole,
  ) {
    this.seed = seed.toMutable();
    this.console = console ?? nullConsole;
  }

  shrink(): Gen<T> {
    this.removeGroups();
    this.shrinkTails();
    this.shrinkAllOptions();
    this.shrinkAllPicks();
    return this.seed.gen;
  }

  trimmedLength(key: GroupKey): number {
    return this.seed.picksAt(key).trimmedLength;
  }

  tryMutate(edits: MultiEdit): boolean {
    this.#tries++;
    return this.seed.tryEdits(edits, this.test);
  }

  tryDeleteRange(
    start: number,
    count: number,
  ): boolean {
    this.#tries++;
    return this.seed.tryDeleteRange(start, count, this.test);
  }

  get tries() {
    return this.#tries;
  }

  /**
   * Removes leading and trailing groups.
   */
  removeGroups(): boolean {
    const startSize = this.seed.groupKeys.length;
    this.removeTailGroups(0, this.seed.groupKeys.length);
    this.removeHeadGroups(this.seed.groupKeys.length - 1);
    return this.seed.groupKeys.length < startSize;
  }

  /**
   * Attempts to remove the given number of groups from the start of the group keys.
   *
   * Returns the number actually removed.
   */
  removeHeadGroups(goal: number): number {
    this.console.log(
      "removeHeadGroups goal:",
      goal,
      "val:",
      this.seed.val,
    );

    let removed = 0;
    while (goal > 0) {
      if (this.tryDeleteRange(0, goal)) {
        // goal achieved
        removed += goal;
        return removed;
      }

      // reduce goal; can't remove them all
      goal--;

      const halfGoal = Math.floor(goal / 2);
      if (halfGoal > 0 && halfGoal < goal) {
        const actual = this.removeHeadGroups(halfGoal);
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
  removeTailGroups(start: number, end: number): number {
    this.console.log(
      "removeTailGroups start:",
      start,
      "end:",
      end,
      "val:",
      this.seed.val,
    );

    while (true) {
      if (this.tryDeleteRange(start, end)) {
        return 0; // removed everything.
      }

      const len = end - start;
      if (len <= 1) {
        return len; // remaining group can't be removed.
      }

      const half = Math.floor(len / 2);
      const remaining = this.removeTailGroups(start + half, end);
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
  shrinkTails(): boolean {
    let keys = this.seed.groupKeys;
    this.console?.log("shrinkTails keys:", keys);
    let changed = false;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (this.trimmedLength(key) <= 2) {
        continue;
      }

      if (this.shrinkTailAt(key)) {
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
  shrinkTailAt(
    key: GroupKey,
  ): boolean {
    this.console.log("shrinkTailAt:", key);
    const len = this.trimmedLength(key);
    assert(len > 0);

    // Try to remove the last pick to fail fast.
    if (!this.tryMutate(trimGroup(key, len - 1))) {
      return false;
    }

    // Binary search to trim a range of unneeded picks at the end of the playout.
    // It might, by luck, jump to an earlier length that works.
    let tooLow = -1;
    let hi = this.trimmedLength(key);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!this.tryMutate(trimGroup(key, mid))) {
        // failed; retry with a higher length
        tooLow = mid;
        continue;
      }
      hi = this.trimmedLength(key);
    }
    return true;
  }

  shrinkAllOptions<T>(): boolean {
    let changed = false;
    for (const key of this.seed.groupKeys) {
      if (this.shrinkSegmentOptions(key)) {
        changed = true;
      }
    }
    return changed;
  }

  shrinkSegmentOptions(key: GroupKey): boolean {
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
      if (!this.tryMutate(removeRange(key, i, end))) {
        const containsEmptyOption = (end === i + 1) &&
          picks.getOption(end) === 0 &&
          picks.getOption(end + 1) !== undefined;

        if (!containsEmptyOption) {
          end = i;
          continue;
        }

        // Try extending the range to include an option that wasn't taken
        if (this.tryMutate(removeRange(key, i, end + 1))) {
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
  shrinkAllPicks(): boolean {
    let changed = false;
    for (const key of this.seed.groupKeys) {
      for (
        let offset = 0;
        offset < this.seed.picksAt(key).length;
        offset++
      ) {
        if (this.shrinkOnePick(key, offset)) {
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
  shrinkOnePick(
    key: GroupKey,
    offset: number,
  ): boolean {
    const diff = this.seed.picksAt(key).diffAt(offset);
    if (diff === 0) {
      return false; // No change; already at the minimum
    }

    // See if the test fails if we subtract one.
    if (!this.tryMutate(replaceOnce(key, offset, diff - 1))) {
      return false; // No change; the postcondition already holds
    }

    // Binary search to find the smallest pick that succeeds.
    let tooLow = -1;
    let hi = this.seed.picksAt(key).diffAt(offset);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!this.tryMutate(replaceOnce(key, offset, mid))) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      hi = this.seed.picksAt(key).diffAt(offset);
    }
    return true;
  }
}
