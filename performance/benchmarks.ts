import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { generate } from "../src/generated.ts";
import { pickRandomSeed, randomPicker } from "../src/random.ts";
import { onePlayout } from "../src/backtracking.ts";
import { take } from "../src/multipass_search.ts";
import { PlayoutSearch } from "../src/searches.ts";

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

Deno.bench("uniqueArray of 6 ints", () => {
  dom.uniqueArray(dom.int32(), { length: 6 });
});

Deno.bench("uniqueArray of 100 ints", () => {
  dom.uniqueArray(dom.int32(), { length: 100 });
});

Deno.bench("generate 10k strings", () => {
  const search = new PlayoutSearch();
  search.pickSource = randomPicker(123);
  for (let i = 0; i < 10000; i++) {
    generate(str, search);
  }
});
