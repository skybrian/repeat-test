import type { Gen, SegmentEditor } from "./gen_class.ts";
import type { SystemConsole } from "./console.ts";

import { assert } from "@std/assert";
import { deleteRange, keep, replaceAt, trimEnd } from "./edits.ts";
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
  editor: SegmentEditor,
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  const next = seed.mutateSegments(editor);
  if (next === undefined || !test(next.val)) {
    return undefined;
  }
  return next;
}

function trimSegment(
  segment: number,
  offset: number,
): SegmentEditor {
  return (seg) => (seg === segment) ? trimEnd(offset) : keep;
}

/**
 * Removes unnecessary picks from the end of a playout.
 * Postcondition: the last pick in the last non-empty segment is necessary.
 */
export function shrinkTail<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let segs = seed.segmentPicks;
  let changed = false;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].trimmedLength === 0) {
      continue;
    }

    const next = shrinkSegmentTail(seed, test, i);
    if (next === undefined) {
      break;
    }
    seed = next;
    changed = true;
    segs = seed.segmentPicks;
  }
  return changed ? seed : undefined;
}

function shrinkSegmentTail<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
  segment: number,
): Gen<T> | undefined {
  function getPicks() {
    const segments = seed.segmentPicks;
    assert(segment < segments.length);
    return seed.segmentPicks[segment];
  }

  const len = getPicks().trimmedLength;
  assert(len > 0);

  // Try to remove the last pick to fail fast.
  const next = tryEdit(trimSegment(segment, len - 1), seed, test);
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
    const next = tryEdit(trimSegment(segment, mid), seed, test);
    if (next === undefined) {
      // failed; retry with a higher length
      tooLow = mid;
      continue;
    }
    seed = next;
    hi = getPicks().trimmedLength;
  }
  return seed;
}

function replacePickInSegment(
  segment: number,
  offset: number,
  val: number,
): SegmentEditor {
  return (seg) => seg === segment ? replaceAt(offset, val) : keep;
}

/**
 * Shrinks the pick at the given offset.
 * Postcondition: decrementing the pick by one would fail the test.
 */
export function shrinkOnePick(segment: number, offset: number): Shrinker {
  return <T>(
    seed: Gen<T>,
    test: (val: T) => boolean,
  ): Gen<T> | undefined => {
    const picks = seed.segmentPicks[segment];

    if (picks.trimmedLength <= offset) {
      return undefined; // No change; nothing to shrink
    }

    const { req, reply } = picks.getPick(offset);
    if (reply === req.min) {
      return undefined; // No change; already at the minimum
    }

    // See if the test fails if we subtract one.
    const next = tryEdit(
      replacePickInSegment(segment, offset, reply - 1),
      seed,
      test,
    );
    if (next === undefined) {
      return undefined; // No change; the postcondition already holds
    }
    seed = next;
    let replies = seed.segmentPicks[segment].replies;

    // Binary search to find the smallest pick that succeeds.
    let tooLow = req.min - 1;
    let hi = replies[offset];
    while (tooLow + 2 <= hi) {
      const mid = (tooLow + 1 + hi) >>> 1;
      assert(mid > tooLow && mid < hi);
      const next = tryEdit(
        replacePickInSegment(segment, offset, mid),
        seed,
        test,
      );
      if (next === undefined) {
        // failed; retry with a higher pick
        tooLow = mid;
        continue;
      }
      seed = next;
      replies = seed.segmentPicks[segment].replies;
      hi = replies[offset];
    }
    return seed;
  };
}

export function shrinkAllPicks<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let changed = false;
  let seg = 0;
  let offset = 0;
  while (true) {
    const segments = seed.segmentPicks;
    if (seg >= segments.length) {
      break;
    }
    const picks = segments[seg];
    if (offset >= picks.length) {
      seg++;
      offset = 0;
      continue;
    }
    const next = shrinkOnePick(seg, offset)(seed, test);
    if (next !== undefined) {
      changed = true;
      seed = next;
    }
    offset++;
  }

  return changed ? seed : undefined;
}

function deleteSegmentRange(
  segment: number,
  start: number,
  end: number,
): SegmentEditor {
  return (seg: number) => (seg === segment) ? deleteRange(start, end) : keep;
}

export function shrinkAllOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
): Gen<T> | undefined {
  let changed = false;
  for (let i = seed.segmentCount - 1; i >= 0; i--) {
    const next = shrinkSegmentOptions(seed, test, i);
    if (next !== undefined) {
      seed = next;
      changed = true;
    }
  }
  return changed ? seed : undefined;
}

export function shrinkSegmentOptions<T>(
  seed: Gen<T>,
  test: (val: T) => boolean,
  segment: number,
): Gen<T> | undefined {
  function getPicks() {
    const segments = seed.segmentPicks;
    assert(segment < segments.length);
    return seed.segmentPicks[segment];
  }

  let picks = getPicks();
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
    let next = tryEdit(deleteSegmentRange(segment, i, end), seed, test);
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
        deleteSegmentRange(segment, i, end + 1),
        seed,
        test,
      );
      if (next === undefined || !test(next.val)) {
        continue;
      }
    }

    seed = next;
    picks = getPicks();
    end = i;
    changed = true;
  }

  return changed ? seed : undefined;
}
