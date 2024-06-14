import { describe, it } from "@std/testing/bdd";
import { fail } from "@std/assert";

import { ChoiceRequest } from "../src/choices.ts";
import { RandomChoices } from "../src/simple_runner.ts";

describe("RandomChoices", () => {
  describe("gen", () => {
    it("generates numbers within the range of a ChoiceRequest", () => {
      const choices = new RandomChoices();
      const bit = new ChoiceRequest(0, 1);
      const expected = [0, 1];
      const counts = [0, 0];
      for (let i = 0; i < 100; i++) {
        const val = choices.next(bit);
        if (!expected.includes(val)) {
          fail(`unexpected output from gen(unbiasedInt): ${val}`);
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
