import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

const examples = arb.string().filter((s) => s.startsWith("a"));

repeatTest(examples, (s) => {
  assert(s.length >= 1);
}, { reps: 1000 });

// Expected output: nothing! (tests pass)
