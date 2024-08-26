import { beforeEach, describe, it } from "@std/testing/bdd";
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
  let calls = 0;

  beforeEach(() => {
    calls = 0;
  });

  function mock(...result: number[]): () => number {
    const expectedCalls = result.length;
    return () => {
      calls++;
      if (calls > expectedCalls) {
        fail(`expected ${expectedCalls} calls to next(), got ${calls}`);
      }
      return result[calls - 1];
    };
  }

  describe("for a range of size 1", () => {
    const min = arb.of(0, 1, 1000, Number.MAX_SAFE_INTEGER);
    it("returns the only possible value", () => {
      const uniform = uniformSource(mock());
      repeatTest(min, (min) => {
        calls = 0;
        assertEquals(uniform(min, min), min);
        assertEquals(calls, 0);
      });
    });
  });

  describe("for small ranges", () => {
    const min = arb.of(0, 1, 1000, Number.MAX_SAFE_INTEGER - 127);
    const size = arb.of(2, 3, 4, 5, 128);
    const lowest = -0x80000000;
    const rangeStart = arb.int(lowest, lowest + 10);
    it("returns each value for a contiguous range of inputs", () => {
      repeatTest(
        arb.record({ min, size, rangeStart }),
        ({ min, size, rangeStart }, console) => {
          const max = min + size - 1;
          console.log(`testing with range ${min}..${max}`);
          const counts = new Array(size).fill(0);
          for (let i = rangeStart; i < rangeStart + size; i++) {
            calls = 0;
            const uniform = uniformSource(mock(i));
            const actual = uniform(min, max);
            assertEquals(calls, 1);
            assert(min <= actual && actual <= max);
            counts[actual - min]++;
          }
          for (let i = 0; i < counts.length; i++) {
            assertEquals(
              counts[i],
              1,
              `${i + min} was picked ${counts[i]} times`,
            );
          }
        },
      );
    });
  });

  describe("for a small range whose size is odd", () => {
    it("tries again if the first input is the maximum value", () => {
      const min = arb.of(0, 1, 1000, Number.MAX_SAFE_INTEGER - 6);
      const size = arb.of(3, 5, 7);
      repeatTest(arb.record({ min, size }), ({ min, size }) => {
        const max = min + size - 1;
        const uniform = uniformSource(mock(0x7fffffff, -0x80000000));
        calls = 0;
        assertEquals(uniform(min, max), min);
        assertEquals(calls, 2);
      });
    });
  });

  describe("for the maximum range", () => {
    it("returns a safe int", () => {
      const uniform = uniformSource(mock(-0x80000000, -0x80000000));
      const actual = uniform(0, Number.MAX_SAFE_INTEGER);
      assert(Number.isSafeInteger(actual));
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
