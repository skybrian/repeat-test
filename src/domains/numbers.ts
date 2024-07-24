import * as dom from "./basics.ts";

export const int32 = dom.int(-(2 ** 31), 2 ** 31 - 1).asFunction();
