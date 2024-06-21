import { Arbitrary, PickFunction } from "./core.ts";
import { chooseDefault, PickRequest, PickRequestOptions } from "../picks.ts";
import { BiasedIntPicker } from "../picks.ts";

/**
 * Defines an arbitrary that's based on a callback function that generates a
 * value from a stream of picks.
 *
 * The callback must always succeed, but see {@link Arbitrary.filter} for a way
 * to do backtracking in a subrequest.
 */
export function custom<T>(callback: (pick: PickFunction) => T): Arbitrary<T> {
  return new Arbitrary((pick) => callback(pick));
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
  const req = new PickRequest(min, max, opts);
  return new Arbitrary((pick) => pick(req));
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

  return new Arbitrary((pick) => pick(req));
}

export function example<T>(values: T[]): Arbitrary<T> {
  if (values.length === 0) {
    throw new Error("Can't choose an example from an empty array");
  }
  if (values.length === 1) {
    return custom(() => values[0]);
  }
  return int(0, values.length - 1).map((idx) => values[idx]);
}

export function boolean(): Arbitrary<boolean> {
  return example([false, true]);
}

export function oneOf<T>(alternatives: Arbitrary<T>[]): Arbitrary<T> {
  if (alternatives.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (alternatives.length === 1) {
    return alternatives[0];
  }
  return example(alternatives).chain((chosen) => chosen);
}

/**
 * An arbitrary but practical limit for maximum array length.
 * (Deno becomes slow at 4e7 and crashes above that for a filled array.)
 */
const maxArrayLength = 1e7;

/** Returns a random integer that's a suitable length for an array. */
export function length(
  min: number,
  max: number,
  opts?: PickRequestOptions,
): Arbitrary<number> {
  if (min < 0) {
    throw new Error("min must be non-negative");
  }
  if (max > maxArrayLength) {
    throw new Error("max is too large");
  }
  const req = new PickRequest(min, max, opts);
  return new Arbitrary((pick) => pick(req));
}

const defaultArrayLimit = 100;

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min?: number; max?: number },
): Arbitrary<T[]> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultArrayLimit;
  return custom((pick) => {
    const len = pick(length(min, max));
    const result: T[] = [];
    for (let i = 0; i < len; i++) {
      result.push(pick(item));
    }
    return result;
  });
}
