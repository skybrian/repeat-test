import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { PickLog, Solution } from "../src/playouts.ts";

describe("PickLog", () => {
  describe("truncate", () => {
    it("does nothing when clearing an empty log", () => {
      const log = new PickLog();
      log.truncate(0);
      assertEquals(log.length, 0);
      assertEquals(log.getPicks(), []);
    });
  });
});

describe("Solution", () => {
  describe("nestedPicks", () => {
    it("returns an empty list when there are no picks or spans", () => {
      const sol = new Solution(123, {
        picks: [],
        spanStarts: [],
        spanEnds: [],
      });
      assertEquals(sol.getNestedPicks(), []);
    });
    it("returns a list of picks when there are only picks", () => {
      const sol = new Solution(123, {
        picks: [1, 2, 3],
        spanStarts: [],
        spanEnds: [],
      });
      assertEquals(sol.getNestedPicks(), [1, 2, 3]);
    });
    it("makes empty nested lists when there are only spans", () => {
      const sol = new Solution(123, {
        picks: [],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[[]]]);
    });
    it("puts the pick first", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [1, 1],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [1, [[]]]);
    });
    it("puts the pick in the middle", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [0, 0],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [[[1]]]);
    });
    it("puts the pick last", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[[]], 1]);
    });
  });
});
