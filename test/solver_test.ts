import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { IntPicker, PickRequest } from "../src/picks.ts";
import {
  generateAllSolutions,
  NestedPicks,
  PlayoutFailed,
  Solution,
} from "../src/solver.ts";

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

function assertSolutions<T>(
  sols: Iterable<Solution<T>>,
  expected: { val: T; picks: NestedPicks }[],
) {
  const actual = Array.from(sols).map((s) => ({
    val: s.val,
    picks: s.getNestedPicks(),
  }));
  assertEquals(actual, expected);
}

describe("generateAllSolutions", () => {
  it("returns nothing if no playouts succeeded", () => {
    function runPlayout() {
      throw new PlayoutFailed("nothing here");
    }
    const sols = generateAllSolutions(runPlayout);
    assertSolutions(sols, []);
  });

  it("returns a single solution if there are no picks", () => {
    function runPlayout() {
      return 123;
    }
    const sols = generateAllSolutions(runPlayout);
    assertSolutions(sols, [{ val: 123, picks: [] }]);
  });

  it("visits both paths when there is a branch", () => {
    const bit = new PickRequest(0, 1);
    function runPlayout(picker: IntPicker) {
      return picker.pick(bit) === 0 ? 123 : 456;
    }
    const sols = generateAllSolutions(runPlayout);
    assertSolutions(sols, [
      { val: 123, picks: [0] },
      { val: 456, picks: [1] },
    ]);
  });
});
