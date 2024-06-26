import Arbitrary from "./arbitrary_class.ts";
import * as arb from "./arbitraries/basics.ts";

export * from "./arbitraries/basics.ts";
export * from "./arbitraries/numbers.ts";
export * from "./arbitraries/strings.ts";
export * from "./arbitraries/records.ts";
export * from "./arbitraries/ranges.ts";

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  return arb.custom((pick) => items.map((item) => pick(item)) as T);
}
