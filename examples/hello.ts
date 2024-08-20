import { assertEquals } from "@std/assert";
import { repeatTest } from "@skybrian/repeat-test";

const examples = ["hello", "world"];

repeatTest(examples, (word) => {
  assertEquals(word.length, 5); // runs twice, with each example
});

// Expected output: nothing! (tests pass)
