import { ChoiceRequest } from "./choices.ts";
import { Arbitrary, ArbitraryInput } from "./core.ts";

/**
 * Returns an integer between min and max, chosen arbitrarily.
 */
export function chosenInt(min: number, max: number): Arbitrary<number> {
  const req = new ChoiceRequest(min, max);
  return new Arbitrary((it) => it.next(req));
}

/**
 * Returns an integer between min and max, chosen with bias towards special cases.
 */
export function biasedInt(min: number, max: number): Arbitrary<number> {
  const req = new ChoiceRequest(min, max, { biased: true });
  return new Arbitrary((it) => it.next(req));
}

/**
 * Creates a custom arbitrary, given a parse callback.
 * @param parse a deterministic function that takes a Choices iterator and returns a value.
 */
export function custom<T>(parse: (it: ArbitraryInput) => T) {
  return new Arbitrary((it) => parse(it));
}

export const boolean = custom((it) => it.gen(chosenInt(0, 1)) === 1);

export function intOutsideRange(min: number, max: number): Arbitrary<number> {
  return custom((it): number => {
    if (it.gen(boolean)) {
      if (min - 1 < min) return min - 1;
      return min - 2 ** 32;
    } else {
      if (max + 1 > max) return max + 1;
      return max + 2 ** 32;
    }
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

export function oneOf<T>(alternatives: Arbitrary<T>[]): Arbitrary<T> {
  if (alternatives.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (alternatives.length === 1) {
    return alternatives[0];
  }
  return custom((it) => {
    const choice = it.gen(example(alternatives));
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
