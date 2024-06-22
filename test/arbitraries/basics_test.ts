import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { Arbitrary } from "../../src/arbitraries.ts";
import * as arb from "../../src/arbitraries.ts";

import { assertParseFails, assertParses } from "../../src/asserts.ts";

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
      assertParseFails(someInt(1, 6), [n], 1, 0);
    }
  });
}

describe("uniformInt", () => {
  itMakesInts(arb.uniformInt);
});

describe("int", () => {
  itMakesInts(arb.int);
});

describe("boolean", () => {
  it("defaults to false", () => {
    assertParseFails(arb.boolean(), [], false, 0);
  });
  it("parses a 0 as false", () => {
    assertParses(arb.boolean(), [0], false);
  });
  it("parses a 1 as true", () => {
    assertParses(arb.boolean(), [1], true);
  });
});

describe("example", () => {
  const oneWay = arb.example([123]);
  describe("for a single example", () => {
    it("defaults to the example", () => {
      assertEquals(oneWay.default, 123);
    });
    it("reads no picks when there is no choice to make", () => {
      assertParses(oneWay, [], 123);
    });
  });
  const twoWay = arb.example([1, 2]);
  it("defaults to the first example", () => {
    assertParseFails(twoWay, [], 1, 0);
  });
  it("reads a pick to decide which example to pick", () => {
    assertParses(twoWay, [0], 1);
    assertParses(twoWay, [1], 2);
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
