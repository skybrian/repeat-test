import { boolean, int, oneOf } from "./basics.ts";
import Arbitrary from "../arbitrary_class.ts";

export const bit = int(0, 1).asFunction();

export const int32 = int(-(2 ** 31), 2 ** 31 - 1).asFunction();

export const safeInt = int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  .asFunction();

export const strangeNumber = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
).asFunction();

export function intOutsideRange(min: number, max: number): Arbitrary<number> {
  return Arbitrary.from((pick): number => {
    if (pick(boolean())) {
      if (min - 1 < min) return min - 1;
      return min - 2 ** 32;
    } else {
      if (max + 1 > max) return max + 1;
      return max + 2 ** 32;
    }
  });
}

export const nonInteger = oneOf<number>([
  strangeNumber(),
  int(-100, 100).map((n) => n + 0.5),
]).asFunction();
