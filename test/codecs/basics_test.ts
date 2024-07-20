import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
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

  it("encodes values as themselves when the domain excludes negative numbers", () => {
    for (let i = 1; i <= 6; i++) {
      assertEncoding(codec.int(1, 6), [i], i);
    }
  });
  it("encodes values by negating them when the domain excludes positive numbers", () => {
    for (let i = -6; i <= -1; i++) {
      assertEncoding(codec.int(-6, -1), [-i], i);
    }
  });
  it("encodes values as a sign and magnitude when the domain includes both positive and negative numbers", () => {
    const signed = codec.int(-3, 3);
    for (let i = 0; i <= 3; i++) {
      assertEncoding(signed, [0, i], i);
    }
    for (let i = -3; i < 0; i++) {
      assertEncoding(signed, [1, -i], i);
    }
  });
});
