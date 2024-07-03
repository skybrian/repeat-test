import Arbitrary, {
  AnyRecord,
  ArbitraryCallback,
  RecordShape,
} from "../arbitrary_class.ts";
import { chooseDefault, PickRequest } from "../picks.ts";
import { BiasedIntPicker } from "../picks.ts";

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

export function bit() {
  return Arbitrary.from(new PickRequest(0, 1));
}

export function boolean(): Arbitrary<boolean> {
  return Arbitrary.of(false, true);
}

/**
 * An integer range, to be picked from uniformly.
 *
 * Invariant: min <= pick <= max.
 */
export function uniformInt(
  min: number,
  max: number,
  opts?: { default?: number },
): Arbitrary<number> {
  return Arbitrary.from(new PickRequest(min, max, opts));
}

function specialNumberBias(
  min: number,
  max: number,
  defaultVal: number,
): BiasedIntPicker {
  function pick(uniform: (min: number, max: number) => number): number {
    switch (uniform(0, 15)) {
      case 0:
        return min;
      case 1:
        return max;
      case 2:
        return defaultVal;
      case 3:
        if (min <= 0 && max >= 0) return 0;
        break;
      case 4:
        if (min <= 1 && max >= 1) return 1;
        break;
      case 5:
        if (min <= -1 && max >= -1) return -1;
    }
    return uniform(min, max);
  }
  return pick;
}

/**
 * An integer range, to be picked from with bias towards special cases.
 */
export function int(
  min: number,
  max: number,
  opts?: { default?: number },
): Arbitrary<number> {
  if (max - min <= 10) {
    return uniformInt(min, max, opts);
  }

  const defaultVal = chooseDefault(min, max, opts);
  const bias = specialNumberBias(min, max, defaultVal);
  const req = new PickRequest(min, max, { default: defaultVal, bias });

  return Arbitrary.from(req);
}

/**
 * Creates an Arbitrary for a record with the given shape.
 */
export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return Arbitrary.record(shape);
}

export function oneOf<T>(cases: Arbitrary<T>[]): Arbitrary<T> {
  if (cases.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (cases.length === 1) {
    return cases[0];
  }
  return Arbitrary.of(...cases).chain((chosen) => chosen);
}

const defaultArrayLimit = 1000;

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min?: number; max?: number },
): Arbitrary<T[]> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultArrayLimit;

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
    while (i < max && pick(boolean())) {
      result.push(pick(item));
      i++;
    }
    return result;
  });
}
