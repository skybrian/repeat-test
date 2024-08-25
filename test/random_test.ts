import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";
import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";

import {
  type BiasedIntPicker,
  type IntPicker,
  PickRequest,
} from "../src/picks.ts";
import { randomPickers, uniformSource } from "../src/random.ts";

describe("uniformSource", () => {
  function mock(result: number, opts?: { expectedCalls: number }) {
    const expectedCalls = opts?.expectedCalls ?? 1;
    let calls = 0;
    return () => {
      calls++;
      if (calls > expectedCalls) {
        fail("should not be called more than once");
      }
      return result;
    };
  }

  const min = arb.of(0, 1, -1, 1000, -1000);
  it("returns the only value for a range of size 1", () => {
    const uniform = uniformSource(mock(0, { expectedCalls: 0 }));
    repeatTest(min, (min) => {
      assertEquals(uniform(min, min), min);
    });
  });

  describe("for a range of size 2", () => {
    it("returns the minimum value for an even number", () => {
      const even = arb.int(-3, 3).map((n) => n * 2);
      repeatTest(arb.record({ min, even }), ({ min, even }) => {
        const uniform = uniformSource(mock(even));
        assertEquals(uniform(min, min + 1), min);
      });
    });

    it("returns the maximum value for an odd number", () => {
      const odd = arb.int(-3, 3).map((n) => n * 2 + 1);
      repeatTest(arb.record({ min, odd }), ({ min, odd }) => {
        const uniform = uniformSource(mock(odd));
        assertEquals(uniform(min, min + 1), min + 1);
      });
    });
  });

  describe("for a range of size 3", () => {
    it("returns something in range", () => {
      const next = arb.int(0, 10);
      repeatTest(arb.record({ min, next }), ({ min, next }) => {
        const uniform = uniformSource(mock(next));
        const actual = uniform(min, min + 2);
        assert(actual >= min);
        assert(actual <= min + 2);
      });
    });
  });
});

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
