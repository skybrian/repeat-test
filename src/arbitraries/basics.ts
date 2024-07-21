import { AnyRecord } from "../types.ts";
import Arbitrary, {
  ArbitraryCallback,
  RecordShape,
} from "../arbitrary_class.ts";
import { PickRequest } from "../picks.ts";

/**
 * An arbitrary based on a callback function.
 *
 * For more, see {@link ArbitraryCallback}.
 */
export function from<T>(callback: ArbitraryCallback<T>): Arbitrary<T> {
  return Arbitrary.from(callback);
}

/** An arbitrary that returns one of the given arguments. */
export function of<T>(...values: T[]): Arbitrary<T> {
  return Arbitrary.of(...values);
}

export const boolean = Arbitrary.of(false, true).asFunction();

/**
 * Chooses a safe integer.
 *
 * Invariant: min <= pick <= max.
 *
 * Negative and non-negative numbers are equally likely, so it's a non-uniform distribution.
 */
export function int(
  min: number,
  max: number,
): Arbitrary<number> {
  if (min >= 0) {
    return Arbitrary.from(new PickRequest(min, max));
  } else if (max <= 0) {
    return Arbitrary.from(new PickRequest(-max, -min)).map((v) => -v);
  } else {
    return Arbitrary.oneOf([int(0, max), int(min, -1)]);
  }
}

export const bit = int(0, 1).asFunction();

/**
 * Creates an Arbitrary for a record with the given shape.
 */
export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return Arbitrary.record(shape);
}

export function oneOf<T>(cases: Arbitrary<T>[]): Arbitrary<T> {
  return Arbitrary.oneOf(cases);
}

export const defaultArrayLimit = 1000;

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min?: number; max?: number },
): Arbitrary<T[]> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultArrayLimit;
  const bit = new PickRequest(0, 1);

  // Arrays are represented using a fixed-length part (items only) followed by a
  // variable-length part where each item is preceded by a 1, followed by a 0 to
  // terminate.
  //
  // Since we make a pick request for each item, this makes long arrays unlikely
  // but possible, and it should be easier remove items when shrinking.
  // TODO: change the odds; we don't want half of all arrays to be empty.
  return Arbitrary.from((pick) => {
    const result = [];
    // fixed-length portion
    let i = 0;
    while (i < min) {
      result.push(pick(item));
      i++;
    }
    // variable-length portion
    while (i < max && pick(bit) === 1) {
      result.push(pick(item));
      i++;
    }
    return result;
  });
}
