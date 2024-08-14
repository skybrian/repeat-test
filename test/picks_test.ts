import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  biasedBit,
  BiasedIntPicker,
  PickList,
  PickRequest,
  PlaybackPicker,
} from "../src/picks.ts";

describe("biasedBit", () => {
  function scan(bias: BiasedIntPicker, bins: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < bins; i++) {
      const arg = i / (bins - 1);
      const uniform = (min: number, max: number) => arg * (max - min) + min;
      out.push(bias(uniform));
    }
    return out;
  }

  it("switches halfway for a fair coin", () => {
    const fair = biasedBit(0.5);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });
  it("switches early for a biased coin", () => {
    const fair = biasedBit(0.1);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
  it("always picks 0 for 0", () => {
    const fair = biasedBit(0);
    assertEquals(scan(fair, 10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("always picks 1 for 1", () => {
    const fair = biasedBit(1);
    assertEquals(scan(fair, 10), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("PickRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      repeatTest(arb.invalidIntRange({ minMin: 0 }), ({ min, max }) => {
        assertThrows(() => new PickRequest(min, max));
      });
    });
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
