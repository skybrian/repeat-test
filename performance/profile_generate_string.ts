import { arb } from "@/mod.ts";

import { generate } from "../src/generated.ts";
import { pickRandomSeed, randomPicker } from "../src/random.ts";
import { onePlayout } from "../src/backtracking.ts";

const str = arb.string({ min: 100, max: 100 });
const rand = randomPicker(pickRandomSeed());

for (let i = 0; i < 10000; i++) {
  generate(str, onePlayout(rand));
}
console.time("generate a string");
console.profile();
for (let i = 0; i < 10000; i++) {
  generate(str, onePlayout(rand));
}
console.profileEnd();
console.timeEnd("generate a string");
console.log("profile done!");
