import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s) => {
  assert(!s.includes("fnord"));
});

// Expected output: nothing! (tests pass)
