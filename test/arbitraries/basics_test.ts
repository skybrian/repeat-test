import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertGenerated, assertValues } from "../lib/asserts.ts";

import { filtered } from "../../src/results.ts";
import { repeatTest } from "@/runner.ts";
import { Arbitrary, PickRequest } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";
import { generate } from "../../src/gen_class.ts";
import { onePlayout } from "../../src/backtracking.ts";
import { randomPicker } from "../../src/random.ts";
import { generateDefault } from "../../src/ordered.ts";
import { usePicks } from "../../src/build.ts";

describe("alias", () => {
  const recurse: Arbitrary<number> = arb.alias(() => depth);

  const depth = Arbitrary.from((pick) => {
    if (pick(PickRequest.bit) === 0) {
      return 0;
    }
    return pick(recurse) + 1;
  });

  it("generates a value", () => {
    assertEquals(depth.directBuild(usePicks(1, 1, 1, 0)), 3);
  });
});

describe("boolean", () => {
  it("is sometimes true", () => {
    repeatTest(arb.boolean(), (val, console) => {
      console.sometimes("true", val);
    });
  });
  it("generates both values", () => {
    assertGenerated(arb.boolean(), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("has maxSize set to 2", () => {
    assertEquals(arb.boolean().maxSize, 2);
  });
  it("has a name", () => {
    assertEquals(arb.boolean().name, "boolean");
  });
});

describe("biased", () => {
  it("generates the same values as boolean", () => {
    assertGenerated(arb.biased(0.9), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("always picks true for probability 1", () => {
    repeatTest(arb.biased(1), (val) => {
      assertEquals(val, true);
    });
  });
  it("always picks false for probability 0", () => {
    repeatTest(arb.biased(0), (val) => {
      assertEquals(val, false);
    });
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
  it("has maxSize set to 2", () => {
    assertEquals(arb.biased(0.9).maxSize, 2);
  });
  it("has a default name", () => {
    assertEquals(arb.biased(0.9).name, "biased boolean");
  });
  it("accepts a custom name", () => {
    assertEquals(arb.biased(0.9).with({ name: "my name" }).name, "my name");
  });
  it("throws if given an invalid probability", () => {
    assertThrows(() => arb.biased(-0.1), Error);
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
  describe("default", () => {
    it("defaults to min for positive numbers", () => {
      assertEquals(generateDefault(arb.int(1, 6)).val, 1);
    });
    it("defaults to max for negative numbers", () => {
      assertEquals(generateDefault(arb.int(-6, -1)).val, -1);
    });
    it("defaults to 0 for a range that includes 0", () => {
      assertEquals(generateDefault(arb.int(-6, 6)).val, 0);
    });
  });
  describe("maxSize", () => {
    it("has maxSize set to the size of the range", () => {
      assertEquals(arb.int(1, 6).maxSize, 6);
    });
  });
  it("has a name", () => {
    assertEquals(arb.int(1, 6).name, "int(1, 6)");
    assertEquals(arb.int(-6, -1).name, "int(-6, -1)");
    assertEquals(arb.int(-6, 6).name, "int(-6, 6)");
  });
});

describe("object", () => {
  describe("with no properties", () => {
    const empty = arb.object({});
    it("creates empty records", () => {
      assertGenerated(empty, [
        { val: {}, picks: [] },
      ]);
      assertEquals(empty.maxSize, 1);
    });
  });
  describe("with constant properties", () => {
    const example = arb.object({
      a: arb.of(1),
      b: arb.of(2),
    });
    it("doesn't make any picks", () => {
      assertGenerated(example, [
        { val: { a: 1, b: 2 }, picks: [] },
      ]);
    });
  });
  describe("with an int property", () => {
    const oneField = arb.object({
      a: arb.int(1, 2),
    });
    it("defaults to the default value of the field", () => {
      assertEquals(generateDefault(oneField).val, { a: 1 });
    });
    it("makes one pick", () => {
      assertGenerated(oneField, [
        { val: { a: 1 }, picks: [1] },
        { val: { a: 2 }, picks: [2] },
      ]);
    });
  });
  describe("with mutiple properties", () => {
    const example = arb.object({
      a: arb.int(1, 2),
      b: arb.int(3, 4),
    });
    it("reads picks ordered by the keys", () => {
      assertGenerated(example, [
        { val: { a: 1, b: 3 }, picks: [1, 3] },
        { val: { a: 2, b: 3 }, picks: [2, 3] },
        { val: { a: 1, b: 4 }, picks: [1, 4] },
        { val: { a: 2, b: 4 }, picks: [2, 4] },
      ]);
    });
  });

  describe("with a property that's an alias", () => {
    const alias = arb.alias(() => {
      throw new Error("should not be called");
    });

    it("shouldn't call the alias when defined", () => {
      arb.object({
        a: arb.int(1, 2),
        b: alias,
      });
    });
  });
});

describe("oneOf", () => {
  const oneWay = arb.oneOf(
    arb.int(1, 2),
  );
  const threeWay = arb.oneOf(
    arb.int(1, 2),
    arb.int(3, 4),
    arb.int(5, 6),
  );
  it("defaults to the first branch", () => {
    assertEquals(generateDefault(oneWay).val, 1);
    assertEquals(generateDefault(threeWay).val, 1);
  });
});
