import { boolean, custom, example, int, oneOf } from "./core.ts";

export const int32 = int(-(2 ** 31), 2 ** 31 - 1);

export const safeInt = int(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
);

export const strangeNumber = example([
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
]);

export function intOutsideRange(min: number, max: number) {
  return custom((pick): number => {
    if (pick(boolean)) {
      if (min - 1 < min) return min - 1;
      return min - 2 ** 32;
    } else {
      if (max + 1 > max) return max + 1;
      return max + 2 ** 32;
    }
  });
}

export const nonInteger = oneOf<number>([
  strangeNumber,
  int(-100, 100).map((n) => n + 0.5),
]);
