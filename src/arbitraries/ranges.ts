import Arbitrary from "../arbitrary_class.ts";
import { from, int, oneOf } from "./basics.ts";
import { nonInteger, safeInt } from "./numbers.ts";
import { record } from "./records.ts";

export type Range = { min: number; max: number };

export type IntRangeOptions = {
  /**
   * The maximum size of a generated range: (max - min + 1) <= size. Defaults to 10.
   */
  maxSize?: number;
};

/**
 * Generates pair of safe integers such that min <= max.
 */
export function intRange(opts?: IntRangeOptions): Arbitrary<Range> {
  const maxSize = opts?.maxSize ?? 10;
  if (maxSize < 1) throw new Error("maxSize must be >= 1");
  return oneOf<Range>([
    Arbitrary.of({ min: 0, max: 0 }),
    from((pick) => {
      const size = pick(int(1, maxSize));
      const min = pick(
        int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - (size - 1)),
      );
      const max = min + (size - 1);
      return { min, max };
    }),
  ]);
}

/**
 * Generates a record that satisfies the Range type, but isn't a valid range of
 * safe integers.
 */
export function invalidIntRange(): Arbitrary<Range> {
  return oneOf<Range>([
    Arbitrary.of({ min: 1, max: 0 }),
    record({ min: safeInt(), max: nonInteger() }),
    record({ min: nonInteger(), max: safeInt() }),
  ]);
}
