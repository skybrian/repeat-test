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
  it("should default to min for positive numbers", () => {
    assertEquals(someInt(1, 6).default, 1);
  });
  it("should default to max for negative numbers", () => {
    assertEquals(someInt(-6, -1).default, -1);
  });
  it("should default to 0 for a range that includes 0", () => {
    assertEquals(someInt(-6, 6).default, 0);
  });
  it("should default to a custom default value", () => {
    assertEquals(someInt(1, 6, { default: 3 }).default, 3);
  });
  it("should accept numbers in range", () => {
    for (let i = 1; i < 6; i++) {
      assertParses(someInt(1, 6), [i], i);
    }
  });
  it("should reject numbers out of range", () => {
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
  it("should default to false", () => {
    assertParseFails(arb.boolean(), [], false, 0);
  });
  it("should parse a 0 as false", () => {
    assertParses(arb.boolean(), [0], false);
  });
  it("should parse a 1 as true", () => {
    assertParses(arb.boolean(), [1], true);
  });
});

describe("example", () => {
  const oneWay = arb.example([1]);
  const twoWay = arb.example([1, 2]);
  it("shouldn't ask for a decision when there's only one example", () => {
    assertParses(oneWay, [], 1);
  });
  it("should default to the first example", () => {
    assertParseFails(twoWay, [], 1, 0);
  });
  it("should select the next example using the next item in the stream", () => {
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
  it("should default to the first branch", () => {
    assertParseFails(oneWay, [], 1, 0);
    assertParseFails(threeWay, [], 1, 0);
  });
  it("shouldn't ask for a decision when there's only one branch", () => {
    assertParses(oneWay, [1], 1);
  });
  it("should select a branch using the next item in the stream", () => {
    assertParses(threeWay, [0, 1], 1);
    assertParses(threeWay, [1, 3], 3);
    assertParses(threeWay, [2, 5], 5);
  });
});
