import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  fail,
} from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import { invalidIntRange } from "../src/arbitraries/ranges.ts";

import {
  alwaysPick,
  biasedBitRequest,
  PickList,
  PickRequest,
  PlaybackPicker,
  subrangeRequest,
  uniformSource,
} from "../src/picks.ts";

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

describe("PickRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      repeatTest(invalidIntRange({ minMin: 0 }), ({ min, max }) => {
        assertThrows(() => new PickRequest(min, max));
      });
    });
  });

  describe("toString", () => {
    it("prints the range", () => {
      assertEquals(new PickRequest(0, 1).toString(), "0..1");
    });
  });
});

describe("biasedBitRequest", () => {
  function scan(req: PickRequest, bins: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < bins; i++) {
      const arg = i / (bins - 1);
      const uniform = (min: number, max: number) => arg * (max - min) + min;
      out.push(req.bias(uniform));
    }
    return out;
  }

  it("switches halfway for a fair coin", () => {
    const fair = biasedBitRequest(0.5);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });
  it("switches early for a biased coin", () => {
    const fair = biasedBitRequest(0.1);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
  it("always picks 0 for 0", () => {
    const fair = biasedBitRequest(0);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("always picks 1 for 1", () => {
    const fair = biasedBitRequest(1);
    assertEquals(scan(fair, 10), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("subrangeRequest", () => {
  it("throws if given an empty list of starts", () => {
    assertThrows(
      () => subrangeRequest([], 0),
      Error,
      "starts must be non-empty",
    );
  });
  it("throws if any start isn't a safe integer", () => {
    assertThrows(
      () => subrangeRequest([1, 1.5, 2], 2),
      Error,
      "starts[1] must be a safe integer; got 1.5",
    );
  });
  it("throws if lastMax isn't a safe integer", () => {
    assertThrows(
      () => subrangeRequest([1], 1.5),
      Error,
      "lastMax must be a safe integer; got 1.5",
    );
  });
  it("throws if a start is lower than the previous start", () => {
    assertThrows(
      () => subrangeRequest([1, 0], 1),
      Error,
      "want: starts[1] >= 1; got 0",
    );
  });
  it("throws if given a start that's higher than lastMax", () => {
    assertThrows(
      () => subrangeRequest([1], 0),
      Error,
      "want: lastMax >= 1; got 0",
    );
  });

  function scan(req: PickRequest, bins: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < bins; i++) {
      const arg = i / (bins - 1);
      let calls = 0;
      const uniform = (min: number, max: number) => {
        calls++;
        switch (calls) {
          case 1:
            return arg * (max - min) + min;
          case 2:
            return min;
          default:
            throw new Error("too many calls to uniform");
        }
      };
      out.push(req.bias(uniform));
    }
    return out;
  }

  it("chooses each range with equal probability", () => {
    const req = subrangeRequest([1, 2, 1000], 2000);
    assertEquals(scan(req, 3), [1, 2, 1000]);
  });
});

describe("alwaysPick", () => {
  it("throws if the pick isn't within the range", () => {
    const threes = alwaysPick(3);
    assertThrows(
      () => threes.pick(new PickRequest(0, 1)),
      Error,
      "can't satisfy request (0, 1) with 3",
    );
  });
});

describe("PickList", () => {
  describe("zip", () => {
    it("throws when given lists with different lengths", () => {
      const reqs = [new PickRequest(0, 1)];
      const vals = [0, 0];
      assertThrows(() => PickList.zip(reqs, vals), Error);
    });
  });
  describe("isBit", () => {
    it("returns false if a pick isn't a bit", () => {
      const roll = new PickRequest(1, 6);
      const picks = PickList.zip([roll], [6]);
      assertFalse(picks.isBit(0));
    });
    it("returns true if a pick is a bit", () => {
      const bit = new PickRequest(0, 1);
      const picks = PickList.zip([bit], [0]);
      assert(picks.isBit(0));
    });
    it("returns true if a pick is a bit with the given value", () => {
      const bit = new PickRequest(0, 1);
      const picks = PickList.zip([bit, bit], [0, 1]);
      assert(picks.isBit(0, 0));
      assertFalse(picks.isBit(0, 1));
      assertFalse(picks.isBit(1, 0));
      assert(picks.isBit(1, 1));
    });
  });
});

describe("PlaybackPicker", () => {
  it("throws if an expected pick isn't an integer", () => {
    assertThrows(
      () => new PlaybackPicker([1, 0.1]),
      Error,
      "1: expected a safe integer, got: 0.1",
    );
  });
  it("throws if an expected pick is negative", () => {
    assertThrows(
      () => new PlaybackPicker([1, 2, -3]),
      Error,
      "2: expected a non-negative integer, got: -3",
    );
  });
});
