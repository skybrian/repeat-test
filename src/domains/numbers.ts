import type { Domain } from "../domain_class.ts";
import * as dom from "./basics.ts";

export const int32: () => Domain<number> = dom.int(-(2 ** 31), 2 ** 31 - 1)
  .asFunction();
