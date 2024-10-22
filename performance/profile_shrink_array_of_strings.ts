import { assert, assertEquals } from "@std/assert";

import { arb } from "@/mod.ts";
import { filtered } from "../src/results.ts";
import { onePlayout } from "../src/backtracking.ts";
import { generate } from "../src/gen_class.ts";
import { randomPicker } from "../src/random.ts";
import { shrink } from "../src/shrink.ts";

function repeatString(s: string, n: number): string {
  let res = "";
  for (let i = 0; i < n; i++) {
    res += s;
  }
  return res;
}

const input = arb.array(arb.string({ length: 100 }), { length: 1000 });
const seed = generate(input, onePlayout(randomPicker(123)));
assert(seed !== filtered);
console.profile();
const gen = shrink(seed, () => true);
console.profileEnd();
const expectedItem = repeatString("a", 100);
assertEquals(gen.val, Array(1000).fill(expectedItem));
