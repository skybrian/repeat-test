import { Arbitrary } from "./core.ts";
import { custom, example, int, oneOf } from "./basics.ts";
import { nonInteger, safeInt } from "./numbers.ts";
import { record } from "./records.ts";

export type Range = { min: number; max: number };

/**
 * Generates pair of safe integers such that min <= max.
 */
export function intRange(): Arbitrary<Range> {
  return oneOf<Range>([
    example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
    custom((pick) => {
      const extras = pick(int(0, 100));
      const min = pick(
        int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - extras),
      );
      const max = min + extras;
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
    example([{ min: 1, max: 0 }]),
    record({ min: safeInt(), max: nonInteger() }),
    record({ min: nonInteger(), max: safeInt() }),
  ]);
}
