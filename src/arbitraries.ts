import { Arbitrary, biasedInt, custom } from "./arbitraries/core.ts";

export * from "./arbitraries/core.ts";
export * from "./arbitraries/numbers.ts";

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
