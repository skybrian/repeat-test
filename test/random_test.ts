import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";

import { BiasedIntPicker, IntPicker, PickRequest } from "../src/picks.ts";
import { randomPickers } from "../src/random.ts";

function checkReturnsAllNumbers(picker: IntPicker, req: PickRequest) {
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

const diceRoll = new PickRequest(1, 6);

function rolls(picker: IntPicker): number[] {
  const result = [];
  for (let i = 0; i < 10; i++) {
    result.push(picker.pick(diceRoll));
  }
  return result;
}

describe("randomPickers", () => {
  it("returns the same sequence each time", () => {
    for (let i = 0; i < 100; i++) {
      const first = rolls(randomPickers(12345 + i).next().value);
      const second = rolls(randomPickers(12345 + i).next().value);
      assertEquals(first, second);
    }
  });
  it("returns a picker that eventually returns every number within the given range", () => {
    const picker = randomPickers(12345).next().value;
    for (const min of [0, 1, 10, 100]) {
      for (const max of [min + 1, min + 3, min + 10, min + 100]) {
        checkReturnsAllNumbers(picker, new PickRequest(min, max));
        const bias: BiasedIntPicker = (u) => u(min, max);
        checkReturnsAllNumbers(picker, new PickRequest(min, max, { bias }));
      }
    }
  });
  it("returns a sequence where each picker is different", () => {
    let prev: number[] | null = null;
    let tries = 0;
    for (const picker of randomPickers(12345)) {
      const picks = rolls(picker);
      if (prev !== null) {
        const equal = prev.every((val, i) => val === picks[i]);
        assert(!equal);
      }
      prev = picks;
      tries++;
      if (tries === 1000) break;
    }
  });
});
