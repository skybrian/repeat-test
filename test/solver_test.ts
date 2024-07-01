import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { IntPicker, PickRequest } from "../src/picks.ts";
import { NestedPicks, PlayoutFailed } from "../src/playouts.ts";
import { generateAllSolutions, Solution } from "../src/solver.ts";

function assertSolutions<T>(
  sols: Iterable<Solution<T>>,
  expected: { val: T; picks: NestedPicks }[],
) {
  const actual = Array.from(sols).map((s) => ({
    val: s.val,
    picks: s.playout.toNestedPicks(),
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
