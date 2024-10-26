import { dom } from "@/mod.ts";
import { assert } from "@std/assert/assert";
import { shrink } from "../src/shrink.ts";
import { assertEquals } from "@std/assert/equals";
import { generate } from "../src/gen_class.ts";
import { onePlayout } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";
import { filtered } from "../src/results.ts";

const str = dom.string({ length: 1000 });
const gen = generate(str, onePlayout(randomPicker(123)));
assert(gen !== filtered);

const original = gen.val;
function checkEq(s: string): boolean {
  return s === original;
}

// warmup
for (let i = 0; i < 10; i++) {
  const result = shrink(gen, checkEq);
  assertEquals(result.val, gen.val);
}

console.log("profiling shrink...");
console.profile();
for (let i = 0; i < 100; i++) {
  shrink(gen, checkEq);
}
console.profileEnd();
