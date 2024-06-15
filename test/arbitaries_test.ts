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
