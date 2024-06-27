import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { IntPicker, PickRequest } from "../src/picks.ts";
import { PlayoutFailed } from "../src/playouts.ts";
import { generateAllSolutions, NestedPicks, Solution } from "../src/solver.ts";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

function validSolution(
  opts?: { maxSpanSize: number; maxDepth: number },
): Arbitrary<Solution<number>> {
  const maxSpanSize = opts?.maxSpanSize ?? 3;
  const maxDepth = (opts?.maxDepth ?? 3) + 1; // Add one for placeholder
  const maxPicks = maxSpanSize;
  const maxSpins = maxDepth * maxSpanSize;

  return arb.from((pick) => {
    const picks: number[] = [];

    // Top-level span is a placeholder that will be removed
    const spanStarts = [0];
    const spanEnds = [NaN];

    const stack = [{ offset: 0, size: 0 }];

    for (let i = 0; i < maxSpins; i++) {
      if (stack.length === 0) break;
      if (!pick(arb.boolean())) {
        const span = stack.pop();
        if (span === undefined) break; // shouldn't happen
        spanEnds[span.offset] = picks.length;
        continue;
      }
      if (stack.length < maxDepth && pick(arb.boolean())) {
        stack.push({ offset: spanStarts.length, size: 0 });
        spanStarts.push(picks.length);
        spanEnds.push(NaN);
      }
      if (
        stack[stack.length - 1].size < maxSpanSize &&
        picks.length < maxPicks && pick(arb.boolean())
      ) {
        stack[stack.length - 1].size++;
        picks.push(picks.length + 1);
      }
    }
    for (let span = stack.pop(); span !== undefined; span = stack.pop()) {
      spanEnds[span.offset] = picks.length;
    }

    spanStarts.splice(0, 1);
    spanEnds.splice(0, 1);

    const val = pick(arb.bit());
    const playout = {
      picks,
      spanStarts,
      spanEnds,
    };
    return new Solution(val, playout);
  });
}

describe("Solution", () => {
  describe("getNestedPicks", () => {
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
    it("interprets empty spans as sequential", () => {
      // This is actually ambigous. Could also be [[]].
      // But SpanLog shouldn't be emitting empty spans anyway.
      const sol = new Solution(123, {
        picks: [],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[], []]);
    });
    it("puts the pick first", () => {
      const sol = new Solution(123, {
        picks: [123],
        spanStarts: [1, 1],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [123, [], []]);
    });
    it("puts the pick in the middle", () => {
      const sol = new Solution(123, {
        picks: [123],
        spanStarts: [0, 0],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [[[123]]]);
    });
    it("puts the pick last", () => {
      const sol = new Solution(123, {
        picks: [123],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[], [], 123]);
    });
    it("handles empty spans anywhere", () => {
      const sol = new Solution(123, {
        picks: [7, 8],
        spanStarts: [0, 0, 0],
        spanEnds: [2, 0, 1],
      });
      assertEquals(sol.getNestedPicks(), [[[], [7], 8]]);
    });
    it("returns a value for any valid solution", () => {
      repeatTest(validSolution(), (sol) => {
        sol.getNestedPicks();
      });
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
