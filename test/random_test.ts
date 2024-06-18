import { describe, it } from "@std/testing/bdd";
import { fail } from "@std/assert";

import { BiasedPicker, NumberPicker, PickRequest } from "../src/picks.ts";
import { RandomPicker } from "../src/random.ts";

function checkReturnsAllNumbers(picker: NumberPicker, req: PickRequest) {
  const size = req.max - req.min + 1;
  const expected = new Array(size).fill(0).map((_, i) => i + req.min);
  const counts = new Array(size).fill(0);
  for (let i = 0; i < size * 20; i++) {
    const val = picker.pick(req);
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

describe("RandomPicker", () => {
  describe("next", () => {
    it(`returns all numbers within range`, () => {
      const picker = new RandomPicker();
      for (const min of [0, 1, -1, 10, 100]) {
        for (const max of [min, min + 1, min + 3, min + 10, min + 100]) {
          checkReturnsAllNumbers(picker, new PickRequest(min, max));
          const bias: BiasedPicker = (u) => u(min, max);
          checkReturnsAllNumbers(picker, new PickRequest(min, max, { bias }));
        }
      }
    });
  });
});
