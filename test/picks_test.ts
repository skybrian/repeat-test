import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { repeatTest } from "../src/runner.ts";
import { invalidIntRange } from "../src/arbitraries/ranges.ts";

import {
  alwaysPick,
  biasedBitRequest,
  PickList,
  PickRequest,
  PlaybackPicker,
  subrangeRequest,
} from "../src/picks.ts";

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
