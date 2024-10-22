import type { Gen, MutableGen } from "./gen_class.ts";
import type { StepEditor, StepKey } from "./edits.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { removeRange, replaceOnce, trimStep } from "./edits.ts";
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

    this.shrinkTails();
    this.console.log("after shrinkTails:", this.seed.val);

    this.shrinkAllOptions();
    this.console.log("after shrinkAllOptions:", this.seed.val);

    this.shrinkAllPicks();
    this.console.log("after shrinkAllPicks:", this.seed.val);

    return this.seed.gen;
  }

  trimmedLength(key: StepKey): number {
    return this.seed.gen.getPicks(key).trimmedLength;
  }

  tryMutate(edit: StepEditor): boolean {
    return this.seed.tryMutate(edit, this.test);
  }

  /**
   * Removes unnecessary picks from the end of each group.
   *
   * Postcondition: the last pick in each group is necessary, or the group is
   * empty.
   */
  shrinkTails(): boolean {
    let keys = this.seed.stepKeys;
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
      keys = this.seed.stepKeys;
    }
    return changed;
  }

  /**
   * Removes unnecessary picks from the end of the given step.
   *
   * Postcondition: the last pick is necessary, or the step has no picks left.
   */
  shrinkTailAt(
    key: StepKey,
  ): boolean {
    this.console.log("shrinkTailAt:", key);
    const len = this.trimmedLength(key);
    assert(len > 0);

    // Try to remove the last pick to fail fast.
    if (!this.tryMutate(trimStep(key, len - 1))) {
      return false;
    }

    // Binary search to trim a range of unneeded picks at the end of the playout.
    // It might, by luck, jump to an earlier length that works.
    let tooLow = -1;
    let hi = this.trimmedLength(key);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!this.tryMutate(trimStep(key, mid))) {
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
    for (const key of this.seed.stepKeys) {
      if (this.shrinkSegmentOptions(key)) {
        changed = true;
      }
    }
    return changed;
  }

  shrinkSegmentOptions(stepKey: StepKey): boolean {
    let picks = this.seed.getPicks(stepKey);
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
      if (!this.tryMutate(removeRange(stepKey, i, end))) {
        const containsEmptyOption = (end === i + 1) &&
          picks.getOption(end) === 0 &&
          picks.getOption(end + 1) !== undefined;

        if (!containsEmptyOption) {
          end = i;
          continue;
        }

        // Try extending the range to include an option that wasn't taken
        if (this.tryMutate(removeRange(stepKey, i, end + 1))) {
          continue;
        }
      }

      picks = this.seed.getPicks(stepKey);
      end = i;
      changed = true;
    }

    return changed;
  }

  /**
   * Attempts to shrink each pick in every step.
   *
   * Postcondition: reducing any pick by one would fail the test.
   */
  shrinkAllPicks(): boolean {
    let changed = false;
    const seen = new Set<StepKey>();
    while (true) {
      const todo = this.seed.stepKeys.filter((key) => !seen.has(key));
      if (todo.length === 0) {
        break;
      }
      for (const key of todo) {
        for (
          let offset = 0;
          offset < this.seed.getPicks(key).length;
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
    stepKey: StepKey,
    offset: number,
  ): boolean {
    // this.console.log("shrinking step:", stepKey, "offset:", offset);

    const diff = this.seed.getPicks(stepKey).diffAt(offset);
    if (diff === 0) {
      return false; // No change; already at the minimum
    }

    // See if the test fails if we subtract one.
    if (!this.tryMutate(replaceOnce(stepKey, offset, diff - 1))) {
      return false; // No change; the postcondition already holds
    }

    // Binary search to find the smallest pick that succeeds.
    let tooLow = -1;
    let hi = this.seed.getPicks(stepKey).diffAt(offset);
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      if (!this.tryMutate(replaceOnce(stepKey, offset, mid))) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      hi = this.seed.getPicks(stepKey).diffAt(offset);
    }
    return true;
  }
}
