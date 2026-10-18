import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import {
  assertGenerated,
  assertSometimes,
  assertValues,
} from "../lib/asserts.ts";

import { filtered } from "../../src/results.ts";
import { repeatTest } from "@/runner.ts";
import { Arbitrary } from "../../src/entrypoints/core.ts";
import * as arb from "@/arbs.ts";
import { generate } from "../../src/gen_class.ts";
import { onePlayout } from "../../src/backtracking.ts";
import { randomPicker } from "../../src/random.ts";

describe("boolean", () => {
  it("is true half the time", () => {
    repeatTest(arb.boolean(), (val, console) => {
      console.checkOdds("true", 0.5, val);
    });
  });
  it("generates both values", () => {
    assertGenerated(arb.boolean(), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
});

describe("biased", () => {
  it("generates the same values as boolean", () => {
    assertGenerated(arb.biased(0.9), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("almost always picks false for a very small probability", () => {
    const samples = arb.array(arb.biased(0.0000001), { length: 100 });
    const wrapped = Arbitrary.from((pick) => {
      const result = pick(samples);
      pick(arb.int(1, 10000000)); // prevent backtracking
      return result;
    });
    const gen = generate(wrapped, onePlayout(randomPicker(123)));
    assert(gen !== filtered);
    const falseCount = gen.val.filter((val) => val === false).length;
    assertEquals(falseCount, 100);
  });
});

describe("int", () => {
  describe("examples", () => {
    it("includes positive numbers within range", () => {
      assertValues(arb.int(1, 6), [1, 2, 3, 4, 5, 6]);
    });
    it("includes negative numbers within range", () => {
      assertValues(arb.int(-3, -2), [-2, -3]);
    });
    it("includes positive and negative numbers within range", () => {
      assertValues(arb.int(-3, 3), [0, -1, 1, -2, 2, -3, 3]);
    });
  });
});

describe("oneOf", () => {
  it("accepts constant alteratives", () => {
    const oneOrTwo = arb.oneOf(Arbitrary.of(1), Arbitrary.of(2));
    assertGenerated(oneOrTwo, [{ val: 1, picks: [0] }, { val: 2, picks: [1] }]);
  });

  it("chooses evenly between two cases", () => {
    const ab = arb.oneOf(arb.of("a"), arb.of("b"));
    assertSometimes(ab, (v) => v === "a", 45, 55);
  });

  it("usually chooses the case with more weight", () => {
    const ab = arb.oneOf(
      arb.of("a").with({ weight: 3 }),
      arb.of("b"),
    );
    assertSometimes(ab, (v) => v === "a", 70, 80);
  });
});
