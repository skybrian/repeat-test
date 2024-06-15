import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { Arbitrary } from "../src/core.ts";
import { parse } from "../src/parser.ts";

import * as arb from "../src/arbitraries.ts";

function checkParses<T>(arb: Arbitrary<T>, choices: number[], expected: T) {
  assertEquals(parse(arb, choices), { ok: true, value: expected });
}

function checkParseFails<T>(
  arb: Arbitrary<T>,
  choices: number[],
  guess: T,
  expectedErrorOffset: number,
) {
  assertEquals(parse(arb, choices), {
    ok: false,
    guess,
    errorOffset: expectedErrorOffset,
  });
}

function intRangeTests(
  f: (min: number, max: number) => Arbitrary<number>,
) {
  it("should accept numbers in range", () => {
    for (let i = 1; i < 6; i++) {
      checkParses(f(1, 6), [i], i);
    }
  });
  it("should reject numbers out of range", () => {
    for (const n of [-1, 0, 7]) {
      checkParseFails(f(1, 6), [n], 1, 0);
    }
  });
  it("should default to min for positive numbers", () => {
    checkParseFails(f(1, 6), [], 1, 0);
  });
  it("should default to max for negative numbers", () => {
    checkParseFails(f(-6, -1), [], -1, 0);
  });
  it("should default to 0 for a range that includes 0", () => {
    checkParseFails(f(-6, 6), [], 0, 0);
  });
}

describe("chosenInt", () => {
  intRangeTests(arb.chosenInt);
});

describe("biasedInt", () => {
  intRangeTests(arb.biasedInt);
});

describe("boolean", () => {
  it("should default to false", () => {
    checkParseFails(arb.boolean, [], false, 0);
  });
  it("should parse a 0 as false", () => {
    checkParses(arb.boolean, [0], false);
  });
  it("should parse a 1 as true", () => {
    checkParses(arb.boolean, [1], true);
  });
});

describe("example", () => {
  const oneWay = arb.example([1]);
  const twoWay = arb.example([1, 2]);
  it("shouldn't ask for a decision when there's only one example", () => {
    checkParses(oneWay, [], 1);
  });
  it("should default to the first example", () => {
    checkParseFails(twoWay, [], 1, 0);
  });
  it("should select the next example using the next item in the stream", () => {
    checkParses(twoWay, [0], 1);
    checkParses(twoWay, [1], 2);
  });
});

describe("oneOf", () => {
  const oneWay = arb.oneOf([
    arb.chosenInt(1, 2),
  ]);
  const threeWay = arb.oneOf([
    arb.chosenInt(1, 2),
    arb.chosenInt(3, 4),
    arb.chosenInt(5, 6),
  ]);
  it("should default to the first branch", () => {
    checkParseFails(oneWay, [], 1, 0);
    checkParseFails(threeWay, [], 1, 0);
  });
  it("shouldn't ask for a decision when there's only one branch", () => {
    checkParses(oneWay, [1], 1);
  });
  it("should select a branch using the next item in the stream", () => {
    checkParses(threeWay, [0, 1], 1);
    checkParses(threeWay, [1, 3], 3);
    checkParses(threeWay, [2, 5], 5);
  });
});

describe("record", () => {
  describe("for an empty record shape", () => {
    it("returns it without needing a decision", () => {
      checkParses(arb.record({}), [], {});
    });
  });
  describe("for a constant record shape", () => {
    const example = arb.record({
      a: arb.example([1]),
      b: arb.example([2]),
    });
    it("returns it without needing a decision", () => {
      checkParses(example, [], { a: 1, b: 2 });
    });
  });
  describe("for a record that requires a decision", () => {
    const oneField = arb.record({
      a: arb.chosenInt(1, 2),
    });
    it("defaults to using the default value of the field", () => {
      checkParseFails(oneField, [], { a: 1 }, 0);
    });
  });
  describe("for a record that requires multiple decisions", () => {
    const example = arb.record({
      a: arb.chosenInt(1, 2),
      b: arb.chosenInt(3, 4),
    });
    it("reads decisions ordered by its keys", () => {
      checkParses(example, [1, 3], { a: 1, b: 3 });
    });
  });
});
