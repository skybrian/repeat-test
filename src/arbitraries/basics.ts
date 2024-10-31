import type { BuildFunction, Pickable, RecordShape } from "@/arbitrary.ts";

import { Arbitrary, biasedBitRequest, PickRequest } from "@/arbitrary.ts";

/**
 * Defines an Arbitrary implemented by a build function.
 *
 * Note: the build function will be executed immediately to verify that it works. If
 * this would cause problems, perhaps implement {@link PickSet} instead.
 *
 * For more, see {@link BuildFunction}.
 */
export function from<T>(build: BuildFunction<T>): Arbitrary<T> {
  return Arbitrary.from(build);
}

/** Returns an Arbitrary that chooses one of the given arguments. */
export function of<T>(...values: T[]): Arbitrary<T> {
  return Arbitrary.of(...values);
}

/**
 * Returns an Arbitrary that stands for another Arbitrary, which might be
 * defined later.
 *
 * Since the initialization is lazy, it's useful for generating examples of
 * recursive types.
 *
 * Usually, the return type must be declared when definining an alias, because
 * TypeScript's type inference doesn't work for recursive types.
 */
export function alias<T>(init: () => Arbitrary<T>): Arbitrary<T> {
  return Arbitrary.alias(init);
}

/** Returns an Arbitrary that generates a boolean. */
export const boolean: () => Arbitrary<boolean> = Arbitrary.of(false, true).with(
  {
    name: "boolean",
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
  const name = `int(${min}, ${max})`;
  if (min >= 0) {
    return Arbitrary.from(new PickRequest(min, max)).with({ name });
  } else if (max <= 0) {
    return Arbitrary.from(new PickRequest(-max, -min)).map((v) => -v).with({
      name,
    });
  } else {
    return Arbitrary.oneOf(int(0, max), int(min, -1)).with({ name });
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
export function biased(probabilityTrue: number): Arbitrary<boolean> {
  if (probabilityTrue < 0 || probabilityTrue > 1) {
    throw new Error("probability must be between 0 and 1");
  }
  if (probabilityTrue === 0) {
    return Arbitrary.of(false);
  } else if (probabilityTrue === 1) {
    return Arbitrary.of(true);
  }
  const req = biasedBitRequest(probabilityTrue);
  const name = "biased boolean";
  return Arbitrary.from(req).map((v) => v === 1).with({ name });
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
export function oneOf<T>(...cases: Pickable<T>[]): Arbitrary<T> {
  return Arbitrary.oneOf(...cases);
}
