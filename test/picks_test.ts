import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  equal,
  fail,
} from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import { invalidIntRange } from "./lib/ranges.ts";

import {
  alwaysPick,
  biasedBitRequest,
  EditPicker,
  type IntEditor,
  noChange,
  PickRequest,
  PlaybackPicker,
} from "../src/picks.ts";

describe("PickRequest.random", () => {
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
      repeatTest(min, (min) => {
        calls = 0;
        assertEquals(new PickRequest(min, min).random(mock()), min);
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
            const actual = new PickRequest(min, max).random(mock(i));
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
        const next = mock(0x7fffffff, -0x80000000);
        calls = 0;
        assertEquals(new PickRequest(min, max).random(next), min);
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
        const next = mock(max - 0x80000000);
        calls = 0;
        const actual = new PickRequest(0, max).random(next);
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
        const next = mock(hi - 0x80000000, lo - 0x80000000);
        calls = 0;
        const actual = new PickRequest(0, max).random(next);
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
    const req = new PickRequest(0, Number.MAX_SAFE_INTEGER);

    it("round-trips a value in two picks", () => {
      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const next = mock(hi - 0x80000000, lo - 0x80000000);
        calls = 0;
        const actual = req.random(next);
        assertEquals(calls, 2);
        assertEquals(actual, n);
      });
    });

    it("retries when the first pick is out of range", () => {
      const [bigHi, _] = splitInt(Number.MAX_SAFE_INTEGER);
      const bigLimit = 2048 * bigHi;

      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const next = mock(
          bigLimit,
          hi - 0x80000000,
          lo - 0x80000000,
        );
        calls = 0;
        const actual = req.random(next);
        assertEquals(actual, n, "round trip failed");
        assertEquals(calls, 3, "expected 3 calls to next()");
      });
    });

    it("retries when the second pick is out of range", () => {
      const [bigHi, bigLo] = splitInt(Number.MAX_SAFE_INTEGER);

      repeatTest(n, (n) => {
        const [hi, lo] = splitInt(n);
        const next = mock(
          bigHi,
          bigLo + 1,
          hi - 0x80000000,
          lo - 0x80000000,
        );
        calls = 0;
        const actual = req.random(next);
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

  it("compares equal to a value with the same range", () => {
    assertEquals(new PickRequest(0, 1), new PickRequest(0, 1));
  });

  it("compares differently when min is different", () => {
    assertFalse(equal(new PickRequest(0, 2), new PickRequest(1, 2)));
  });

  it("compares differently when max is different", () => {
    assertFalse(equal(new PickRequest(0, 1), new PickRequest(0, 2)));
  });
});

describe("biasedBitRequest", () => {
  function scan(req: PickRequest, bins: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < bins; i++) {
      const input = 0x100000000 * (i / (bins - 1)) - 0x80000000;
      out.push(req.random(() => input));
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

const addOne: IntEditor = {
  replace(_, before) {
    return before + 1;
  },
};

const deleteAll: IntEditor = {
  replace(_req, _before) {
    return undefined;
  },
};

describe("EditPicker", () => {
  it("throws if a previous pick isn't an integer", () => {
    assertThrows(
      () => new EditPicker([0, 0.1], noChange),
      Error,
      "1: expected a safe integer, got: 0.1",
    );
  });
  it("throws if a previous pick is negative", () => {
    assertThrows(
      () => new EditPicker([0, 2, -3], noChange),
      Error,
      "2: expected a non-negative integer, got: -3",
    );
  });
  it("returns the same picks if the editor doesn't change them", () => {
    const picker = new EditPicker([0, 1], noChange);
    assertEquals(picker.pick(new PickRequest(0, 3)), 0);
    assertEquals(picker.pick(new PickRequest(0, 3)), 1);
    assertEquals(picker.edits, 0);
  });
  it("returns minimum picks if there are no previous picks", () => {
    const picker = new EditPicker([], noChange);
    assertEquals(picker.pick(new PickRequest(1, 3)), 1);
    assertEquals(picker.pick(new PickRequest(2, 4)), 2);
    assertEquals(picker.edits, 0);
  });
  it("returns the new pick if the editor changes it", () => {
    const picker = new EditPicker([0, 1], addOne);
    assertEquals(picker.pick(new PickRequest(0, 3)), 1);
    assertEquals(picker.pick(new PickRequest(0, 3)), 2);
    assertEquals(picker.edits, 2);
  });
  it("returns the minumum pick if the editor changes it to be out of range", () => {
    const picker = new EditPicker([0, 1, 2], addOne);
    assertEquals(picker.pick(new PickRequest(0, 0)), 0);
    assertEquals(picker.pick(new PickRequest(0, 1)), 0);
    assertEquals(picker.pick(new PickRequest(0, 3)), 3);
    assertEquals(picker.edits, 2);
    assertEquals(picker.deletes, 0);
  });
  it("returns minimum picks if the editor deletes everything", () => {
    const picker = new EditPicker([0, 1, 2], deleteAll);
    assertEquals(picker.pick(new PickRequest(0, 3)), 0);
    assertEquals(picker.edits, 0);
    assertEquals(picker.deletes, 3);
  });
});
