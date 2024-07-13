import Arbitrary from "../arbitrary_class.ts";
import { from, int, oneOf, record } from "./basics.ts";
import { nonInteger, safeInt } from "./numbers.ts";

export type Range = { min: number; max: number };

export type IntRangeOptions = {
  /**
   * The minimum size of a generated range: (max - min + 1) >= size. Defaults to 1.
   */
  minSize?: number;

  /**
   * The maximum size of a generated range: (max - min + 1) <= size. Defaults to 10.
   */
  maxSize?: number;
};

/**
 * Generates pair of safe, non-negative integers such that min <= max.
 */
export function intRange(opts?: IntRangeOptions): Arbitrary<Range> {
  const minSize = opts?.minSize ?? 1;
  if (minSize < 1) throw new Error("minSize must be >= 1");
  const maxSize = opts?.maxSize ?? 10;
  if (maxSize < 1) throw new Error("maxSize must be >= 1");
  if (minSize > maxSize) throw new Error("minSize must be <= maxSize");

  return oneOf<Range>([
    Arbitrary.of({ min: 0, max: minSize - 1 }),
    from((pick) => {
      const size = pick(int(minSize, maxSize));
      const min = pick(
        int(0, Number.MAX_SAFE_INTEGER - (size - 1)),
      );
      const max = min + (size - 1);
      return { min, max };
    }),
  ]);
}

/**
 * Generates a record that satisfies the Range type, but isn't a valid range of
 * non-negative safe integers.
 */
export function invalidIntRange(): Arbitrary<Range> {
  return oneOf<Range>([
    Arbitrary.of({ min: 1, max: 0 }),
    Arbitrary.of({ min: -1, max: 0 }),
    record({ min: safeInt(), max: nonInteger() }),
    record({ min: nonInteger(), max: safeInt() }),
  ]);
}
