import { Arbitrary, PickFunction } from "./core.ts";
import { PickRequest } from "../picks.ts";

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
  function pickBiased(
    uniform: (min: number, max: number) => number,
  ): number {
    switch (uniform(0, 15)) {
      case 0:
        return req.min;
      case 1:
        return req.max;
      case 2:
        return req.default;
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

  const req = new PickRequest(min, max, { ...opts, bias: pickBiased });
  return new Arbitrary((pick) => pick(req));
}

/**
 * Defines an arbitrary that's based on a callback function that generates a
 * value from a stream of picks.
 *
 * The callback must always succeed, but see {@link Arbitrary.filter} for a way
 * to do backtracking in a subrequest.
 */
export function custom<T>(callback: (pick: PickFunction) => T) {
  return new Arbitrary((pick) => callback(pick));
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

export const boolean = example([false, true]);

export function oneOf<T>(alternatives: Arbitrary<T>[]): Arbitrary<T> {
  if (alternatives.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (alternatives.length === 1) {
    return alternatives[0];
  }
  return example(alternatives).chain((chosen) => chosen);
}

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min?: number; max?: number },
): Arbitrary<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return custom((pick) => {
    const length = pick(int(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(pick(item));
    }
    return result;
  });
}
