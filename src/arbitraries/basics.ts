import { Arbitrary, biasedBitRequest, PickRequest } from "@/arbitrary.ts";

import type {
  PickCallback,
  PickFunction,
  PickSet,
  RecordShape,
} from "@/arbitrary.ts";

import { parseArrayOpts } from "../options.ts";
import type { ArrayOpts } from "../options.ts";

/**
 * Defines an Arbitrary implemented by a callback function.
 *
 * For more, see {@link PickCallback}.
 */
export function from<T>(
  callback: PickCallback<T>,
): Arbitrary<T> {
  return Arbitrary.from(callback);
}

/** Returns an Arbitrary that chooses one of the given arguments. */
export function of<T>(...values: T[]): Arbitrary<T> {
  return Arbitrary.of(...values);
}

/** Returns an Arbitrary that generates a boolean. */
export const boolean: () => Arbitrary<boolean> = Arbitrary.of(false, true).with(
  {
    label: "boolean",
  },
).asFunction();

/**
 * Defines an Arbitrary that chooses a safe integer in the given range.
 *
 * Invariant: min <= pick <= max.
 *
 * When choosing randomly, min is negative, and max is positive, negative and
 * non-negative numbers are equally likely to be chosen. This will be a
 * non-uniform distribution when abs(min) !== max.
 */
export function int(
  min: number,
  max: number,
): Arbitrary<number> {
  const label = `int(${min}, ${max})`;
  if (min >= 0) {
    return Arbitrary.from(new PickRequest(min, max)).with({ label });
  } else if (max <= 0) {
    return Arbitrary.from(new PickRequest(-max, -min)).map((v) => -v).with({
      label,
    });
  } else {
    return Arbitrary.oneOf(int(0, max), int(min, -1)).with({ label });
  }
}

/**
 * Defines an Arbitrary that simulates a biased coin.
 *
 * When set to 0 or 1, this returns a constant. For any other value, it's a hint
 * that's only used when picking randomly.
 *
 * Setting a bias is useful mostly to encourage an Arbitrary to generate larger
 * values when picking randomly.
 */
export function biased(
  probabilityTrue: number,
  opts?: { label: string },
): Arbitrary<boolean> {
  if (probabilityTrue < 0 || probabilityTrue > 1) {
    throw new Error("probability must be between 0 and 1");
  }
  if (probabilityTrue === 0) {
    return Arbitrary.of(false);
  } else if (probabilityTrue === 1) {
    return Arbitrary.of(true);
  }
  const req = biasedBitRequest(probabilityTrue);
  const label = opts?.label ?? "biased boolean";
  return Arbitrary.from(req).map((v) => v === 1).with({ label });
}

/**
 * Defines an Arbitrary that generates record with the given shape.
 */
export function record<T extends Record<string, unknown>>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return Arbitrary.record(shape);
}

/**
 * Defines an Arbitrary that generates a value using any of the given PickSets.
 */
export function oneOf<T>(...cases: PickSet<T>[]): Arbitrary<T> {
  return Arbitrary.oneOf(...cases);
}

const addArrayItem = biased(0.9);

/**
 * Defines an Arbitrary that generates an array of the given item.
 */
export function array<T>(
  item: PickSet<T>,
  opts?: ArrayOpts,
): Arbitrary<T[]> {
  const { min, max } = parseArrayOpts(opts);

  // Arrays are represented using a fixed-length part (items only) followed by a
  // variable-length part where each item is preceded by a 1, followed by a 0 to
  // terminate.
  //
  // Since we make a pick request for each item, this makes long arrays unlikely
  // but possible, and it should be easier remove items when shrinking.
  const pickArray = (pick: PickFunction) => {
    const result = [];
    // fixed-length portion
    let i = 0;
    while (i < min) {
      result.push(pick(item));
      i++;
    }
    // variable-length portion
    while (i < max && pick(addArrayItem)) {
      result.push(pick(item));
      i++;
    }
    return result;
  };
  return Arbitrary.from(pickArray).with({ label: "array" });
}
