import { arb } from "@/mod.ts";
import { take } from "../src/multipass_search.ts";

console.time("generate 10k char16");
console.profile();
for (let i = 0; i < 10; i++) {
  take(arb.char16(), 10000);
}
console.profileEnd();
console.timeEnd("generate 10k char16");
console.log("profile done!");
