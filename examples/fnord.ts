import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

const example = arb.object({
  prefix: arb.string(),
  suffix: arb.string(),
});

repeatTest(example, ({ prefix, suffix }) => {
  const s = prefix + "fnord" + suffix;
  assert(s.includes("fnord"));
});

// Expected output: nothing! (tests pass)
