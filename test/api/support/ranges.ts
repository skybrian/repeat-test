import { Arbitrary } from "@skybrian/repeat-test/core";
import * as arb from "@skybrian/repeat-test/arbs";
import { frozen } from "@skybrian/repeat-test";

export type Range = { min: number; max: number };

export type IntRangeOptions = {
  /** The minimum value of the low end of the range. Defaults to Number.MIN_SAFE_INTEGER. */
  minMin?: number;
  /** The minimum size of a generated range: (max - min + 1) >= size. Defaults to 1. */
  minSize?: number;
  /** The maximum size of a generated range: (max - min + 1) <= size. Defaults to 10. */
  maxSize?: number;
};

/** Generates pairs of safe integers such that min <= max. */
export function intRange(opts?: IntRangeOptions): Arbitrary<Range> {
  const minMin = opts?.minMin ?? Number.MIN_SAFE_INTEGER;
  const minSize = opts?.minSize ?? 1;
  if (minSize < 1) throw new Error("minSize must be >= 1");
  const maxSize = opts?.maxSize ?? 10;
  if (maxSize < minSize) throw new Error("maxSize must be >= minSize");
  const examples: Range[] = frozen([
    ...(minMin <= 0 ? [{ min: 0, max: minSize - 1 }] : []),
    ...(minMin <= -1 ? [{ min: -1, max: minSize - 2 }] : []),
  ]);
  return arb.oneOf<Range>(
    Arbitrary.of(...examples),
    arb.from((pick) => {
      const size = pick(arb.int(minSize, maxSize));
      const min = pick(arb.int(minMin, Number.MAX_SAFE_INTEGER - (size - 1)));
      return { min, max: min + size - 1 };
    }),
  );
}

/** Generates a safe integer range and a value within that range. */
export function minMaxVal(
  opts?: IntRangeOptions,
): Arbitrary<Range & { val: number }> {
  const range = intRange(opts);
  return arb.from((pick) => {
    const { min, max } = pick(range);
    return { min, max, val: pick(arb.int(min, max)) };
  });
}

const strangeNumber = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
);
const nonInteger: () => Arbitrary<number> = arb.oneOf<number>(
  strangeNumber,
  arb.int(-100, 100).map((n) => n + 0.5),
).asFunction();

/** Generates a Range-shaped value that is not a valid safe-integer range. */
export function invalidIntRange(opts?: { minMin: number }): Arbitrary<Range> {
  const minMin = opts?.minMin ?? Number.MIN_SAFE_INTEGER;
  const validMin = arb.int(minMin, Number.MAX_SAFE_INTEGER);
  let invalidMin = nonInteger();
  if (minMin > Number.MIN_SAFE_INTEGER) {
    invalidMin = arb.oneOf(
      invalidMin,
      arb.int(Number.MIN_SAFE_INTEGER, minMin - 1),
    );
  }
  return arb.oneOf<Range>(
    Arbitrary.of(frozen({ min: 1, max: 0 })),
    arb.object({ min: validMin, max: nonInteger() }),
    arb.object({ min: invalidMin, max: arb.int32() }),
  );
}
