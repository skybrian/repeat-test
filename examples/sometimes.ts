import { assert } from "@std/assert";
import { arb, repeatTest } from "@skybrian/repeat-test";

repeatTest(arb.string(), (s, console) => {
  console.sometimes("s is long enough", s.length >= 50);
  assert(s.length >= 0);
});
