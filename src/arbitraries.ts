import { Arbitrary, ChoiceRequest, Choices } from "./types.ts";

/**
 * Returns an integer between min and max, chosen arbitrarily.
 */
export function chosenInt(min: number, max: number): Arbitrary<number> {
  return new ChoiceRequest(min, max).toArbitrary();
}

/**
 * Creates a custom arbitrary, given a parse callback.
 * @param parse a deterministic function that takes a Choices iterator and returns a value.
 */
export function custom<T>(parse: (it: Choices) => T) {
  return new Arbitrary(parse);
}

/**
 * Returns an integer between min and max.
 * For large ranges, the choice will be biased towards special cases.
 */
export function biasedInt(min: number, max: number): Arbitrary<number> {
  const size = max - min + 1;
  if (size <= 10) return chosenInt(min, max);

  return custom((it) => {
    switch (it.gen(chosenInt(1, 20))) {
      case 1:
        return min;
      case 2:
        return max;
      case 3:
        if (min <= 0 && max >= 0) return 0;
    }
    return it.gen(chosenInt(min, max));
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
    return custom(() => values[0]);
  }
  return custom((it) => values[it.gen(biasedInt(0, values.length - 1))]);
}

export const strangeNumber = example([
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
]);

export function oneOf<T>(reqs: Arbitrary<T>[]): Arbitrary<T> {
  if (reqs.length === 0) {
    throw new Error("Can't choose an item from an empty array");
  }
  if (reqs.length === 1) {
    return reqs[0];
  }
  return custom((it) => {
    const choice = it.gen(example(reqs));
    return it.gen(choice);
  });
}

export const nonInteger = oneOf<number>([
  strangeNumber,
  custom((it) => it.gen(biasedInt(-100, 100)) + 0.5),
]);

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  return custom((it) => items.map((item) => it.gen(item)) as T);
}

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min: number; max: number },
): Arbitrary<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return custom((it) => {
    const length = it.gen(biasedInt(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(it.gen(item));
    }
    return result;
  });
}

type AnyRecord = Record<string, unknown>;
type RecordShape<T extends AnyRecord> = { [K in keyof T]: Arbitrary<T[K]> };

export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return custom((it) => {
    const keys = Object.keys(shape) as (keyof T)[];
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = it.gen(shape[key]);
    }
    return result as T;
  });
}
