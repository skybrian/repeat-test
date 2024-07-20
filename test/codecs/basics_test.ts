import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as codec from "../../src/codecs.ts";

describe("Codec.int", () => {
  it("throws when given an invalid range", () => {
    repeatTest(arb.invalidIntRange(), ({ min, max }) => {
      assertThrows(() => codec.int(min, max));
    });
  });

  const minMaxVal = arb.from((pick) => {
    const { min, max } = pick(arb.intRange());
    const val = pick(arb.int(min, max));
    return { min, max, val };
  });

  it("round-trips integers for any valid range", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      assertRoundTrip(codec.int(min, max), val);
    });
  });

  it("returns a solution that matches the original value", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      const cdc = codec.int(min, max);
      const solution = cdc.toSolution(val);
      assert(solution !== undefined);
      assertEquals(solution.val, val);
    });
  });
});
