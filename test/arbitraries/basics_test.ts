import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import Arbitrary from "../../src/arbitrary_class.ts";
import * as arb from "../../src/arbitraries.ts";

import {
  assertParseFails,
  assertParses,
  assertSolutions,
} from "../../src/asserts.ts";

describe("boolean", () => {
  it("defaults to false", () => {
    assertParseFails(arb.boolean(), []);
  });
  it("has two solutions", () => {
    assertSolutions(arb.boolean(), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("has maxSize set to 2", () => {
    assertEquals(arb.boolean().maxSize, 2);
  });
});

function itMakesInts(
  someInt: (
    min: number,
    max: number,
    opts?: { default?: number },
  ) => Arbitrary<number>,
) {
  it("defaults to min for positive numbers", () => {
    assertEquals(someInt(1, 6).default, 1);
  });
  it("defaults to max for negative numbers", () => {
    assertEquals(someInt(-6, -1).default, -1);
  });
  it("defaults to 0 for a range that includes 0", () => {
    assertEquals(someInt(-6, 6).default, 0);
  });
  it("defaults to a custom default value", () => {
    assertEquals(someInt(1, 6, { default: 3 }).default, 3);
  });
  it("accepts numbers in range", () => {
    for (let i = 1; i < 6; i++) {
      assertParses(someInt(1, 6), [i], i);
    }
  });
  it("rejects numbers out of range", () => {
    for (const n of [-1, 0, 7]) {
      assertParseFails(someInt(1, 6), [n]);
    }
  });
  it("has maxSize set to the size of the range", () => {
    assertEquals(someInt(1, 6).maxSize, 6);
  });
}

describe("uniformInt", () => {
  itMakesInts(arb.uniformInt);
});

describe("int", () => {
  itMakesInts(arb.int);
});

describe("record", () => {
  describe("for an empty record shape", () => {
    const empty = arb.record({});
    it("creates empty records", () => {
      assertEquals(empty.default, {});
      assertSolutions(empty, [
        { val: {}, picks: [] },
      ]);
      assertEquals(empty.maxSize, 1);
    });
  });
  describe("for a constant record shape", () => {
    const example = arb.record({
      a: arb.of(1),
      b: arb.of(2),
    });
    it("doesn't make any picks", () => {
      assertSolutions(example, [
        { val: { a: 1, b: 2 }, picks: [] },
      ]);
    });
  });
  describe("for a record with a single field", () => {
    const oneField = arb.record({
      a: arb.uniformInt(1, 2),
    });
    it("defaults to the default value of the field", () => {
      assertEquals(oneField.default, { a: 1 });
    });
    it("makes one pick", () => {
      assertSolutions(oneField, [
        { val: { a: 1 }, picks: [1] },
        { val: { a: 2 }, picks: [2] },
      ]);
    });
  });
  describe("for a record with mutiple fields", () => {
    const example = arb.record({
      a: arb.uniformInt(1, 2),
      b: arb.uniformInt(3, 4),
    });
    it("reads picks ordered by the keys", () => {
      assertSolutions(example, [
        { val: { a: 1, b: 3 }, picks: [1, 3] },
        { val: { a: 1, b: 4 }, picks: [1, 4] },
        { val: { a: 2, b: 3 }, picks: [2, 3] },
        { val: { a: 2, b: 4 }, picks: [2, 4] },
      ]);
    });
  });
});

describe("oneOf", () => {
  const oneWay = arb.oneOf([
    arb.uniformInt(1, 2),
  ]);
  const threeWay = arb.oneOf([
    arb.uniformInt(1, 2),
    arb.uniformInt(3, 4),
    arb.uniformInt(5, 6),
  ]);
  it("defaults to the first branch", () => {
    assertEquals(oneWay.default, 1);
    assertEquals(threeWay.default, 1);
  });
  it("reads no picks when there's only one branch", () => {
    assertParses(oneWay, [1], 1);
  });
  it("reads a pick to select a branch", () => {
    assertParses(threeWay, [0, 1], 1);
    assertParses(threeWay, [1, 3], 3);
    assertParses(threeWay, [2, 5], 5);
  });
});

describe("array", () => {
  describe("with default settings", () => {
    it("defaults to an empty array", () => {
      assertEquals(arb.array(arb.boolean()).default, []);
    });
    it("parses a zero as ending the array", () => {
      assertParses(arb.array(arb.boolean()), [0], []);
    });
    it("parses a one as starting an item", () => {
      assertParses(arb.array(arb.boolean()), [1, 0, 0], [false]);
    });
    it("parses a two-item array", () => {
      assertParses(arb.array(arb.boolean()), [1, 0, 1, 1, 0], [false, true]);
    });
  });
  describe("with a fixed-size array", () => {
    const item = arb.int(0, 3, { default: 1 });
    const fixed = arb.array(item, { min: 2, max: 2 });
    it("defaults to an array of default values", () => {
      assertEquals(fixed.default, [1, 1]);
    });
    it("parses each item in the array", () => {
      assertParses(fixed, [3, 2], [3, 2]);
    });
  });
});
