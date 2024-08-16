import { int, oneOf } from "./basics.ts";
import { Arbitrary } from "../arbitrary_class.ts";

export const int32: () => Arbitrary<number> = int(-(2 ** 31), 2 ** 31 - 1)
  .asFunction();

export const safeInt: () => Arbitrary<number> = int(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
)
  .asFunction();

export const strangeNumber: () => Arbitrary<number> = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
).asFunction();

export const nonInteger: () => Arbitrary<number> = oneOf<number>([
  strangeNumber(),
  int(-100, 100).map((n) => n + 0.5),
]).asFunction();
