import { describe, it } from "@std/testing/bdd";
import { assertParseFails, assertParses } from "../src/asserts.ts";

import * as arb from "../src/arbitraries.ts";

describe("record", () => {
  describe("for an empty record shape", () => {
    it("returns it without needing a decision", () => {
      assertParses(arb.record({}), [], {});
    });
  });
  describe("for a constant record shape", () => {
    const example = arb.record({
      a: arb.example([1]),
      b: arb.example([2]),
    });
    it("returns it without needing a decision", () => {
      assertParses(example, [], { a: 1, b: 2 });
    });
  });
  describe("for a record that requires a decision", () => {
    const oneField = arb.record({
      a: arb.chosenInt(1, 2),
    });
    it("defaults to using the default value of the field", () => {
      assertParseFails(oneField, [], { a: 1 }, 0);
    });
  });
  describe("for a record that requires multiple decisions", () => {
    const example = arb.record({
      a: arb.chosenInt(1, 2),
      b: arb.chosenInt(3, 4),
    });
    it("reads decisions ordered by its keys", () => {
      assertParses(example, [1, 3], { a: 1, b: 3 });
    });
  });
});
