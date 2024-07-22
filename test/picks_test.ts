import { describe, it } from "@std/testing/bdd";
import { assert, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickList, PickRequest } from "../src/picks.ts";

describe("PickRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      repeatTest(arb.invalidIntRange({ minMin: 0 }), ({ min, max }) => {
        assertThrows(() => new PickRequest(min, max));
      });
    });
  });
});

describe("PickList", () => {
  describe("isBit", () => {
    it("returns false if a pick isn't a bit", () => {
      const roll = new PickRequest(1, 6);
      const picks = new PickList([roll], [6]);
      assertFalse(picks.isBit(0));
    });
    it("returns true if a pick is a bit", () => {
      const bit = new PickRequest(0, 1);
      const picks = new PickList([bit], [0]);
      assert(picks.isBit(0));
    });
    it("returns true if a pick is a bit with the given value", () => {
      const bit = new PickRequest(0, 1);
      const picks = new PickList([bit, bit], [0, 1]);
      assert(picks.isBit(0, 0));
      assertFalse(picks.isBit(0, 1));
      assertFalse(picks.isBit(1, 0));
      assert(picks.isBit(1, 1));
    });
  });
});
