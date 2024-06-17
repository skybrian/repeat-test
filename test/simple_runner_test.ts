import { describe, it } from "@std/testing/bdd";
import { assertEquals, fail } from "@std/assert";

import { ChoiceRequest } from "../src/core.ts";
import { RandomChoices } from "../src/simple_runner.ts";
import TestRunner from "../src/simple_runner.ts";
import { Arbitrary } from "../mod.ts";

describe("RandomChoices", () => {
  describe("next", () => {
    it("generates numbers within the range of a ChoiceRequest", () => {
      const choices = new RandomChoices();
      const bit = new ChoiceRequest(0, 1);
      const expected = [0, 1];
      const counts = [0, 0];
      for (let i = 0; i < 100; i++) {
        const val = choices.next(bit);
        if (!expected.includes(val)) {
          fail(`unexpected output from next(): ${val}`);
        }
        counts[val]++;
      }
      for (const val of expected) {
        if (counts[val] < 10) {
          fail();
        }
      }
    });
  });
});

describe("TestRunner", () => {
  describe("repeatTest", () => {
    it("runs the test function the specified number of times", () => {
      const runner = new TestRunner();
      for (let expected = 0; expected < 100; expected++) {
        let actual = 0;
        const increment = () => {
          actual++;
        };
        const zero = new Arbitrary(() => 0);
        runner.repeat(zero, increment, { reps: expected });
        assertEquals(actual, expected);
      }
    });
  });
});
