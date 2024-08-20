import { assertEquals } from "@std/assert";
import { repeatTest } from "../mod.ts";

const examples = ["hello", "world"];

repeatTest(examples, (word) => {
  assertEquals(word.length, 5); // runs twice, with each example
});
