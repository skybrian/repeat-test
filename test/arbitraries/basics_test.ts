import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";

import {
  assertFirstMembers,
  assertFirstSolutions,
  assertMembers,
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

describe("int", () => {
  describe("members", () => {
    it("includes each number within range", () => {
      assertMembers(arb.int(1, 6), [1, 2, 3, 4, 5, 6]);
      assertMembers(arb.int(-3, -2), [-2, -3]);
      assertMembers(arb.int(-2, 2), [0, 1, 2, -1, -2]);
    });
  });
  describe("default", () => {
    it("defaults to min for positive numbers", () => {
      assertEquals(arb.int(1, 6).default, 1);
    });
    it("defaults to max for negative numbers", () => {
      assertEquals(arb.int(-6, -1).default, -1);
    });
    it("defaults to 0 for a range that includes 0", () => {
      assertEquals(arb.int(-6, 6).default, 0);
    });
    it("defaults to a custom default value", () => {
      assertEquals(arb.int(1, 6, { default: 3 }).default, 3);
    });
  });
  describe("parse", () => {
    it("accepts numbers in range", () => {
      for (let i = 1; i < 6; i++) {
        assertParses(arb.int(1, 6), [i], i);
      }
      for (let i = -1; i < -6; i++) {
        assertParses(arb.int(-6, -1), [i], i);
      }
      for (let i = -2; i < -2; i++) {
        assertParses(arb.int(-2, 2), [i], i);
      }
    });
    it("rejects numbers out of range", () => {
      for (const n of [-1, 0, 7]) {
        assertParseFails(arb.int(1, 6), [n]);
      }
    });
  });
  describe("maxSize", () => {
    it("has maxSize set to the size of the range", () => {
      assertEquals(arb.int(1, 6).maxSize, 6);
    });
  });
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
      a: arb.int(1, 2),
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
      a: arb.int(1, 2),
      b: arb.int(3, 4),
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
    arb.int(1, 2),
  ]);
  const threeWay = arb.oneOf([
    arb.int(1, 2),
    arb.int(3, 4),
    arb.int(5, 6),
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
  describe("of booleans", () => {
    const bools = arb.array(arb.boolean());
    it("defaults to an empty array", () => {
      assertEquals(bools.default, []);
    });
    describe("parse", () => {
      it("parses a zero as ending the array", () => {
        assertParses(bools, [0], []);
      });
      it("parses a one as starting an item", () => {
        assertParses(bools, [1, 0, 0], [false]);
      });
      it("parses a two-item array", () => {
        assertParses(bools, [1, 0, 1, 1, 0], [false, true]);
      });
    });
    describe("members", () => {
      it("returns lists for each combination", () => {
        assertFirstSolutions(bools, [
          { val: [], picks: [0] },
          { val: [false], picks: [1, 0, 0] },
          { val: [true], picks: [1, 1, 0] },
          { val: [false, false], picks: [1, 0, 1, 0, 0] },
          { val: [false, true], picks: [1, 0, 1, 1, 0] },
        ]);
      });
    });
  });
  describe("of ints", () => {
    const ints = arb.array(arb.int(0, 2 ** 16));
    it("defaults to an empty array", () => {
      assertEquals(ints.default, []);
    });
    describe("members", () => {
      it("returns lists for each combination", () => {
        assertFirstMembers(ints, [
          [],
          [0],
          [1],
          [2],
        ]);
      });
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
