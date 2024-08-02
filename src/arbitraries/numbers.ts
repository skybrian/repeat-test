import { int, oneOf } from "./basics.ts";
import Arbitrary from "../arbitrary_class.ts";

export const int32 = int(-(2 ** 31), 2 ** 31 - 1).asFunction();

export const safeInt = int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  .asFunction();

export const strangeNumber = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
).asFunction();

export const nonInteger = oneOf<number>([
  strangeNumber(),
  int(-100, 100).map((n) => n + 0.5),
]).asFunction();
