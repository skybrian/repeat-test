import { assertEquals } from "@std/assert";
import { repeatTest } from "@skybrian/repeat-test";
import { describe, it } from "@std/testing/bdd";

describe("String.length", () => {
  it("returns the right length for the words in a greeting", () => {
    const examples = ["hello", "world"];
    repeatTest(examples, (word) => {
      assertEquals(word.length, 5);
    });
  });
});
