import { Arbitrary, custom } from "./arbitraries/core.ts";

export * from "./arbitraries/core.ts";
export * from "./arbitraries/numbers.ts";
export * from "./arbitraries/strings.ts";

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  return custom((it) => items.map((item) => it.gen(item)) as T);
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
