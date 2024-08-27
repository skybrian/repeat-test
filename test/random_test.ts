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

  function splitInt(n: number): [number, number] {
    const hi = Math.floor(n / (2 ** 32));
    const lo = n - hi * (2 ** 32);
    return [hi, lo];
  }

  describe("can pick the maximum value in range", () => {
    it("for ranges that require one pick", () => {
      const max = arb.of(
        1,
        2,
        1000,
        2 ** 32 - 1,
      );
      repeatTest(max, (max) => {
        const uniform = uniformSource(mock(max - 0x80000000));
        calls = 0;
        const actual = uniform(0, max);
        assertEquals(actual, max);
        assertEquals(calls, 1);
      });
    });
    it("for ranges that require two picks", () => {
      const max = arb.of(
        2 ** 32,
        2 * (2 ** 32) - 1,
        2 * (2 ** 32),
        2 * (2 ** 32) + 1,
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER,
      );
      repeatTest(max, (max) => {
        const [hi, lo] = splitInt(max);
        const uniform = uniformSource(mock(hi - 0x80000000, lo - 0x80000000));
        calls = 0;
        const actual = uniform(0, max);
        assertEquals(actual, max);
        assertEquals(calls, 2, "expected 2 calls to next()");
      });
    });
  });

  describe("for the maximum range", () => {
    const n = arb.of(
      0,
      1,
      1000,
      2 ** 32 - 1,
      2 ** 32,
      Number.MAX_SAFE_INTEGER - 1,
      Number.MAX_SAFE_INTEGER,
    );

    it("round-trips a value in two picks", () => {
      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const uniform = uniformSource(mock(hi - 0x80000000, lo - 0x80000000));
        calls = 0;
        const actual = uniform(0, Number.MAX_SAFE_INTEGER);
        assertEquals(calls, 2);
        assertEquals(actual, n);
      });
    });

    it("retries when the first pick is out of range", () => {
      const [bigHi, _] = splitInt(Number.MAX_SAFE_INTEGER);
      const bigLimit = 2048 * bigHi;

      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const uniform = uniformSource(
          mock(
            bigLimit,
            hi - 0x80000000,
            lo - 0x80000000,
          ),
        );
        calls = 0;
        const actual = uniform(0, Number.MAX_SAFE_INTEGER);
        assertEquals(actual, n, "round trip failed");
        assertEquals(calls, 3, "expected 3 calls to next()");
      });
    });

    it("retries when the second pick is out of range", () => {
      const [bigHi, bigLo] = splitInt(Number.MAX_SAFE_INTEGER);

      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const uniform = uniformSource(
          mock(
            bigHi,
            bigLo + 1,
            hi - 0x80000000,
            lo - 0x80000000,
          ),
        );
        calls = 0;
        const actual = uniform(0, Number.MAX_SAFE_INTEGER);
        assertEquals(actual, n, "round trip failed");
        assertEquals(calls, 4, "expected 4 calls to next()");
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
