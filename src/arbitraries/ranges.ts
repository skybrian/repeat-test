import { Arbitrary } from "../arbitrary_class.ts";
import { from, int, oneOf, record } from "./basics.ts";
import { safeInt } from "./numbers.ts";

export type Range = { min: number; max: number };

export type IntRangeOptions = {
  /** The minimum value of the low end of the range. Defaults to Number.MIN_SAFE_INTEGER. */
  minMin?: number;

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
 * Generates pair of safe integers such that min <= max.
 */
export function intRange(opts?: IntRangeOptions): Arbitrary<Range> {
  const minMin = opts?.minMin ?? Number.MIN_SAFE_INTEGER;

  const minSize = opts?.minSize ?? 1;
  if (minSize < 1) throw new Error("minSize must be >= 1");

  const maxSize = opts?.maxSize ?? 10;
  if (maxSize < minSize) throw new Error("maxSize must be >= minSize");

  const examples: Range[] = [];
  if (minMin <= 0) {
    examples.push({ min: 0, max: minSize - 1 });
  }
  if (minMin <= -1) {
    examples.push({ min: -1, max: minSize - 2 });
  }

  return oneOf<Range>([
    Arbitrary.of(...examples),
    from((pick) => {
      const size = pick(int(minSize, maxSize));
      const min = pick(
        int(minMin, Number.MAX_SAFE_INTEGER - (size - 1)),
      );
      const max = min + (size - 1);
      return { min, max };
    }),
  ]);
}

/**
 * Generates a safe integer range and a value within that range.
 */
export function minMaxVal(
  opts?: IntRangeOptions,
): Arbitrary<Range & { val: number }> {
  const range = intRange(opts);
  return from((pick) => {
    const { min, max } = pick(range);
    const val = pick(int(min, max));
    return { min, max, val };
  });
}

const strangeNumber = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
);

const nonInteger: () => Arbitrary<number> = oneOf<number>([
  strangeNumber,
  int(-100, 100).map((n) => n + 0.5),
]).asFunction();

/**
 * Generates a record that satisfies the Range type, but isn't a valid range of
 * non-negative safe integers.
 */
export function invalidIntRange(opts?: { minMin: number }): Arbitrary<Range> {
  const minMin = opts?.minMin ?? Number.MIN_SAFE_INTEGER;

  const validMin = int(minMin, Number.MAX_SAFE_INTEGER);

  let invalidMin = nonInteger();
  if (minMin > Number.MIN_SAFE_INTEGER) {
    invalidMin = oneOf([invalidMin, int(Number.MIN_SAFE_INTEGER, minMin - 1)]);
  }

  return oneOf<Range>([
    Arbitrary.of({ min: 1, max: 0 }),
    record({ min: validMin, max: nonInteger() }),
    record({ min: invalidMin, max: safeInt() }),
  ]);
}
