import { boolean, custom, example, int, oneOf } from "./basics.ts";
import { Arbitrary } from "./core.ts";

export function int32(): Arbitrary<number> {
  return int(-(2 ** 31), 2 ** 31 - 1);
}

export function safeInt(): Arbitrary<number> {
  return int(
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
}

export function strangeNumber(): Arbitrary<number> {
  return example([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
  ]);
}

export function intOutsideRange(min: number, max: number): Arbitrary<number> {
  return custom((pick): number => {
    if (pick(boolean())) {
      if (min - 1 < min) return min - 1;
      return min - 2 ** 32;
    } else {
      if (max + 1 > max) return max + 1;
      return max + 2 ** 32;
    }
  });
}

export function nonInteger(): Arbitrary<number> {
  return oneOf<number>([
    strangeNumber(),
    int(-100, 100).map((n) => n + 0.5),
  ]);
}
