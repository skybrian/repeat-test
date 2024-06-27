import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertSolutions } from "../../src/asserts.ts";

import * as arb from "../../src/arbitraries/basics.ts";
import { record } from "../../src/arbitraries/records.ts";

describe("record", () => {
  describe("for an empty record shape", () => {
    const empty = record({});
    it("creates empty records", () => {
      assertEquals(empty.default, {});
      assertSolutions(empty, [
        { val: {}, picks: [] },
      ]);
      assertEquals(empty.maxSize, 1);
    });
  });
  describe("for a constant record shape", () => {
    const example = record({
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
    const oneField = record({
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
    const example = record({
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
