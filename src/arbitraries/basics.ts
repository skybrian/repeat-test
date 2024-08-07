import { AnyRecord } from "../types.ts";
import Arbitrary, {
  ArbitraryOpts,
  PickCallback,
  PickSet,
  RecordShape,
} from "../arbitrary_class.ts";
import { biasedBit, PickRequest } from "../picks.ts";

/**
 * An arbitrary based on a callback function.
 *
 * For more, see {@link PickCallback}.
 */
export function from<T>(
  callback: PickCallback<T>,
  opts?: ArbitraryOpts,
): Arbitrary<T> {
  return Arbitrary.from(callback, opts);
}

/** An arbitrary that returns one of the given arguments. */
export function of<T>(...values: T[]): Arbitrary<T> {
  return Arbitrary.of(...values);
}

export const boolean = Arbitrary.from([false, true], { label: "boolean" })
  .asFunction();

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
  const label = `int(${min}, ${max})`;
  if (min >= 0) {
    return Arbitrary.from(new PickRequest(min, max), { label });
  } else if (max <= 0) {
    return Arbitrary.from(new PickRequest(-max, -min)).map((v) => -v, {
      label,
    });
  } else {
    return Arbitrary.oneOf([int(0, max), int(min, -1)], { label });
  }
}

/**
 * Simulates a biased coin.
 *
 * When set to 0 or 1, this returns a constant. For any other value, it's a hint
 * that's only used when picking randomly. The test case generator will ignore
 * the bias when searching for a playout that meets other constraints.
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
  const bias = biasedBit(probabilityTrue);
  const req = new PickRequest(0, 1, { bias });
  const label = opts?.label ?? "biased boolean";
  return Arbitrary.from(req).map((v) => v === 1, { label });
}

/**
 * Creates an Arbitrary for a record with the given shape.
 */
export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return Arbitrary.record(shape);
}

export function oneOf<T>(cases: PickSet<T>[]): Arbitrary<T> {
  return Arbitrary.oneOf(cases);
}

export const defaultArrayLimit = 1000;

const addArrayItem = biased(0.9);

export function array<T>(
  item: PickSet<T>,
  opts?: { min?: number; max?: number; label?: string },
): Arbitrary<T[]> {
  const label = opts?.label ?? "array";
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultArrayLimit;

  // Arrays are represented using a fixed-length part (items only) followed by a
  // variable-length part where each item is preceded by a 1, followed by a 0 to
  // terminate.
  //
  // Since we make a pick request for each item, this makes long arrays unlikely
  // but possible, and it should be easier remove items when shrinking.
  return Arbitrary.from((pick) => {
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
  }, { label });
}
