import { arb, dom } from "@/mod.ts";
import { assert } from "@std/assert/assert";
import { shrink } from "../src/shrink.ts";
import { assertEquals } from "@std/assert/equals";
import { randomPicker } from "../src/random.ts";
import { usePicker } from "../src/build.ts";

const pick = usePicker(randomPicker(123));
const input = arb.string({ length: 10000 }).directBuild(pick);
const gen = dom.string({ length: 10000 }).regenerate(input);
assert(gen.ok);

const original = gen.val;
function checkEq(s: string): boolean {
  return s === original;
}

// warmup
const result = shrink(gen, checkEq);
assertEquals(result.val, gen.val);

console.log("profiling shrink...");
console.profile();
shrink(gen, checkEq);
console.profileEnd();
