import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { generate } from "../src/build.ts";
import { pickRandomSeed, randomPicker } from "../src/random.ts";
import { onePlayout } from "../src/backtracking.ts";
import { take } from "../src/ordered.ts";
import { randomPlayouts } from "../src/random.ts";
import { assert } from "@std/assert/assert";
import { shrink } from "../src/shrink.ts";

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
  for (let i = 0; i < 10000; i++) {
    generate(str, randomPlayouts(123));
  }
});

Deno.bench("shrink a 1k string", (b) => {
  const str = dom.string({ length: 1000 });
  const gen = generate(str, onePlayout(randomPicker(123)));
  assert(gen !== undefined);
  b.start();
  shrink(gen, (s) => s === gen.val);
  b.end();
  assert(gen.val === gen.val);
});
