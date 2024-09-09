import { assert } from "@std/assert";
import { arb, type Examples, repeatTest } from "@skybrian/repeat-test";

const examples: Examples<string> = [
  "hello",
  "world",
  "fnord",
  arb.string(),
];

repeatTest(examples, (s) => {
  assert(s.length >= 0); // runs 1004 times
});

// Expected output: nothing! (tests pass)
