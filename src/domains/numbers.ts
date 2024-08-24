import type { Domain } from "@/domain.ts";
import * as dom from "./basics.ts";

/**
 * A domain that accepts signed 32-bit integers.
 */
export const int32: () => Domain<number> = dom.int(-(2 ** 31), 2 ** 31 - 1)
  .asFunction();
