import { describe, it } from "@std/testing/bdd";
import { fail } from "@std/assert";

import { BiasFunction, ChoiceRequest } from "../src/choices.ts";
import { RandomChoices } from "../src/random.ts";

function checkReturnsAllNumbers(req: ChoiceRequest) {
  const choices = new RandomChoices();
  const size = req.max - req.min + 1;
  const expected = new Array(size).fill(0).map((_, i) => i + req.min);
  const counts = new Array(size).fill(0);
  for (let i = 0; i < size * 10; i++) {
    const val = choices.next(req);
    if (!expected.includes(val)) {
      fail(`unexpected output from next(): ${val}`);
    }
    counts[val - req.min]++;
  }
  for (const val of expected) {
    if (counts[val] == 0) {
      fail(
        `next() never returned ${val + req.min} for (${req.min}, ${req.max})`,
      );
    }
  }
}

describe("RandomChoices", () => {
  describe("next", () => {
    it(`returns all numbers within range`, () => {
      for (const min of [0, 1, -1, 10, 100]) {
        for (const max of [min, min + 1, min + 3, min + 10, min + 100]) {
          checkReturnsAllNumbers(new ChoiceRequest(min, max));
          const bias: BiasFunction = (u) => u(min, max);
          checkReturnsAllNumbers(new ChoiceRequest(min, max, { bias }));
        }
      }
    });
  });
});
