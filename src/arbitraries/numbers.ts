import { int } from "./basics.ts";
import type { Arbitrary } from "../arbitrary_class.ts";

/**
 * Returns an Arbitrary that generates a signed 32-bit integer.
 */
export const int32: () => Arbitrary<number> = int(-(2 ** 31), 2 ** 31 - 1)
  .asFunction();

/**
 * Returns an Arbitrary that generates a signed, safe integer.
 */
export const safeInt: () => Arbitrary<number> = int(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
)
  .asFunction();
