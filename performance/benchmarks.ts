import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { generate } from "../src/generated.ts";
import { pickRandomSeed, randomPicker } from "../src/random.ts";
import { onePlayout } from "../src/backtracking.ts";
import { take } from "../src/multipass_search.ts";

const str = arb.string({ length: 100 });
const rand = randomPicker(pickRandomSeed());

Deno.bench("generate a string", () => {
  generate(str, onePlayout(rand));
});

Deno.bench("take 10k char16", () => {
  take(arb.char16(), 10000);
});

Deno.bench("uniqueArray of 5 ints", () => {
  dom.uniqueArray(dom.int32(), { length: 5 });
});
