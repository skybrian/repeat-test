import type { Gen, MutableGen } from "./gen_class.ts";
import type { GroupKey, MultiEdit } from "./edits.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { removeGroups, removeRange, replaceOnce, trimGroup } from "./edits.ts";
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

  constructor(
    seed: Gen<T>,
    private readonly test: (arg: T) => boolean,
    console?: SystemConsole,
  ) {
    this.seed = seed.toMutable();
    this.console = console ?? nullConsole;
  }

  shrink(): Gen<T> {
    this.console.log("shrink:", this.seed.val);

    this.removeGroups();
    this.console.log("after removeGroups:", this.seed.val);

    this.shrinkTails();
    this.console.log("after shrinkTails:", this.seed.val);

    this.shrinkAllOptions();
    this.console.log("after shrinkAllOptions:", this.seed.val);

    this.shrinkAllPicks();
    this.console.log("after shrinkAllPicks:", this.seed.val);

    return this.seed.gen;
  }

  trimmedLength(key: GroupKey): number {
    return this.seed.picksAt(key).trimmedLength;
  }

  tryMutate(edits: MultiEdit): boolean {
    return this.seed.tryEdits(edits, this.test);
  }

  /**
   * Removes entire groups, using a binary search to avoid trying each group
   * individually where possible.
   */
  removeGroups(keys?: GroupKey[]): boolean {
    if (keys === undefined) {
      keys = this.seed.groupKeys;
    }
    this.console.log("removeGroups keys:", keys, "val:", this.seed.val);

    // First try removing the entire range.
    if (this.tryMutate(removeGroups(new Set(keys)))) {
      this.console.log(
        "-removed- keys:",
        this.seed.groupKeys,
        "val:",
        this.seed.val,
      );
      return true;
    }

    // Split in two and try each half.
    const half = Math.floor(keys.length / 2);
    if (half < 1) {
      return false; // too few groups
    }

    const items = Array.from(keys);
    // Remove the second half first, so that the indexes don't shift for the first half.
    const secondChanged = this.removeGroups(items.slice(half));
    const firstChanged = this.removeGroups(items.slice(0, half));
    return secondChanged || firstChanged;
  }

  /**
   * Removes unnecessary picks from the end of each group.
   *
   * Postcondition: the last pick in each group is necessary, or the group is
   * empty.
   */
  shrinkTails(): boolean {
    let keys = this.seed.groupKeys;
    this.console?.log("shrinkTails keys:", keys);
    let changed = false;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (this.trimmedLength(key) === 0) {
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
    const seen = new Set<GroupKey>();
    while (true) {
      const todo = this.seed.groupKeys.filter((key) => !seen.has(key));
      if (todo.length === 0) {
        break;
      }
      for (const key of todo) {
        for (
          let offset = 0;
          offset < this.seed.picksAt(key).length;
          offset++
        ) {
          if (this.shrinkOnePick(key, offset)) {
            changed = true;
          }
        }
        seen.add(key);
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
