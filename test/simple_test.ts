import { describe, it } from "@std/testing/bdd";
import { fail } from "@std/assert";

import { ChoiceRequest } from "../src/types.ts";

import { RandomChoices } from "../src/simple.ts";

describe("RandomChoices", () => {
  describe("gen", () => {
    it("generates numbers in range for a NextInt request", () => {
      const choices = new RandomChoices();
      const bits = new ChoiceRequest(0, 1);
      const expected = [0, 1];
      const counts = [0, 0];
      for (let i = 0; i < 100; i++) {
        const val = choices.gen(bits);
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
