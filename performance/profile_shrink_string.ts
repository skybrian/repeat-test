import { dom } from "@/mod.ts";
import { assert } from "@std/assert/assert";
import { shrink } from "../src/shrink.ts";
import { assertEquals } from "@std/assert/equals";
import { generate } from "../src/generated.ts";
import { onePlayout } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";

const str = dom.string({ length: 10000 });
const gen = generate(str, onePlayout(randomPicker(123)));
assert(gen !== undefined);
console.log("profiling shrink...");
console.profile();
const result = shrink(str, (s) => s === gen.val, gen);
console.profileEnd();
assertEquals(result.val, gen.val);
