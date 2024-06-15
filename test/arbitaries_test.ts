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
