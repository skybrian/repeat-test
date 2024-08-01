import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertGenerated,
  assertValues,
} from "../../src/asserts.ts";

describe("boolean", () => {
  it("defaults to false", () => {
    assertEquals(arb.boolean().default(), false);
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
  it("has a label", () => {
    assertEquals(arb.boolean().label, "boolean");
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
      assertValues(arb.int(-3, 3), [0, -1, 1, 2, 3, -2, -3]);
    });
  });
  describe("default", () => {
    it("defaults to min for positive numbers", () => {
      assertEquals(arb.int(1, 6).default(), 1);
    });
    it("defaults to max for negative numbers", () => {
      assertEquals(arb.int(-6, -1).default(), -1);
    });
    it("defaults to 0 for a range that includes 0", () => {
      assertEquals(arb.int(-6, 6).default(), 0);
    });
  });
  describe("maxSize", () => {
    it("has maxSize set to the size of the range", () => {
      assertEquals(arb.int(1, 6).maxSize, 6);
    });
  });
  it("has a label", () => {
    assertEquals(arb.int(1, 6).label, "int(1, 6)");
    assertEquals(arb.int(-6, -1).label, "int(-6, -1)");
    assertEquals(arb.int(-6, 6).label, "int(-6, 6)");
  });
});

describe("record", () => {
  describe("for an empty record shape", () => {
    const empty = arb.record({});
    it("creates empty records", () => {
      assertEquals(empty.default(), {});
      assertGenerated(empty, [
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
      assertGenerated(example, [
        { val: { a: 1, b: 2 }, picks: [] },
      ]);
    });
  });
  describe("for a record with a single field", () => {
    const oneField = arb.record({
      a: arb.int(1, 2),
    });
    it("defaults to the default value of the field", () => {
      assertEquals(oneField.default(), { a: 1 });
    });
    it("makes one pick", () => {
      assertGenerated(oneField, [
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
      assertGenerated(example, [
        { val: { a: 1, b: 3 }, picks: [1, 3] },
        { val: { a: 2, b: 3 }, picks: [2, 3] },
        { val: { a: 1, b: 4 }, picks: [1, 4] },
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
    assertEquals(oneWay.default(), 1);
    assertEquals(threeWay.default(), 1);
  });
});

describe("array", () => {
  describe("of booleans", () => {
    const bools = arb.array(arb.boolean());
    it("defaults to an empty array", () => {
      assertEquals(bools.default(), []);
    });
    describe("generateAll", () => {
      it("returns each combination in increasing order", () => {
        assertFirstGenerated(bools, [
          { val: [], picks: [0] },
          { val: [false], picks: [1, 0, 0] },
          { val: [true], picks: [1, 1, 0] },
          { val: [false, false], picks: [1, 0, 1, 0, 0] },
          { val: [true, false], picks: [1, 1, 1, 0, 0] },
          { val: [false, true], picks: [1, 0, 1, 1, 0] },
          { val: [true, true], picks: [1, 1, 1, 1, 0] },
        ]);
      });
    });
  });
  describe("of unsigned ints", () => {
    const ints = arb.array(arb.int(0, 2 ** 32));
    it("defaults to an empty array", () => {
      assertEquals(ints.default(), []);
    });
    describe("examples", () => {
      it("returns each combination in increasing order", () => {
        assertFirstValues(ints, [
          [],
          [0],
          [1],
          [2],
        ]);
      });
    });
  });
});
