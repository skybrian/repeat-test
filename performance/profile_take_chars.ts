import { arb } from "@/mod.ts";
import { take } from "../src/multipass_search.ts";

take(arb.char16(), 10000);
console.time("generate all char16");
console.profile();
take(arb.char16(), 100000);
console.profileEnd();
console.timeEnd("generate all char16");
console.log("profile done!");
