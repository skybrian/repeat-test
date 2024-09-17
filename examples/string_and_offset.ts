import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

const example = arb.from((pick) => {
  const s = pick(arb.string());
  const offset = pick(arb.int(0, s.length));
  return { s, offset };
});

repeatTest(example, ({ s, offset }) => {
  assert(offset >= 0 && offset <= s.length);
});

// Expected output: nothing! (tests pass)
