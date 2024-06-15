import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { Arbitrary } from "../src/choices.ts";
import { ArrayChoices } from "../src/simple_choices.ts";

function checkParse<T>(arb: Arbitrary<T>, choices: number[], expected: T) {
  const it = new ArrayChoices(choices);
  assertEquals(arb.parse(it), expected);
  assertEquals(it.failureOffset, null);
}

describe("boolean", () => {
  it("should default to false", () => {
    assertEquals(arb.boolean.default, false);
  });
  it("should parse a 0 as false", () => {
    checkParse(arb.boolean, [0], false);
  });
  it("should parse a 1 as true", () => {
    checkParse(arb.boolean, [1], true);
  });
});
