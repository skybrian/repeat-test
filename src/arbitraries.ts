import { Arbitrary, ChoiceRequest } from "./types.ts";

/**
 * Returns an integer between min and max, chosen arbitrarily.
 */
export function chosenInt(min: number, max: number): Arbitrary<number> {
  return new ChoiceRequest(min, max).toArbitrary();
}

/**
 * Returns an integer between min and max.
 * For large ranges, the choice will be biased towards special cases.
 */
export function biasedInt(min: number, max: number): Arbitrary<number> {
  const size = max - min + 1;
  if (size <= 10) {
    return new Arbitrary((r) => r.gen(chosenInt(min, max)));
  }
  return new Arbitrary((r) => {
    switch (r.gen(chosenInt(1, 20))) {
      case 1:
        return min;
      case 2:
        return max;
      case 3:
        if (min <= 0 && max >= 0) return 0;
    }
    return r.gen(chosenInt(min, max));
  });
}

export const safeInt = biasedInt(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
);

export function example<T>(values: T[]): Arbitrary<T> {
  if (values.length === 0) {
    throw new Error("Can't choose an example from an empty array");
  }
  if (values.length === 1) {
    return new Arbitrary(() => values[0]);
  }
  return new Arbitrary((r) => values[r.gen(biasedInt(0, values.length - 1))]);
}

export function oneOf<T>(reqs: Arbitrary<T>[]): Arbitrary<T> {
  if (reqs.length === 0) {
    throw new Error("Can't choose an item from an empty array");
  }
  if (reqs.length === 1) {
    return reqs[0];
  }
  return new Arbitrary((r) => {
    const choice = r.gen(example(reqs));
    return r.gen(choice);
  });
}

export const strangeNumber = example([
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
]);

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  return new Arbitrary((r) => items.map((g) => r.gen(g)) as T);
}

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min: number; max: number },
): Arbitrary<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return new Arbitrary((r) => {
    const length = r.gen(biasedInt(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(r.gen(item));
    }
    return result;
  });
}

type AnyRecord = Record<string, unknown>;
type RecordShape<T extends AnyRecord> = { [K in keyof T]: Arbitrary<T[K]> };

export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return new Arbitrary((r) => {
    const keys = Object.keys(shape) as (keyof T)[];
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = r.gen(shape[key]);
    }
    return result as T;
  });
}
