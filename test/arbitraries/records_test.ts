import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertParseFails, assertSolutions } from "../../src/asserts.ts";

import * as arb from "../../src/arbitraries/basics.ts";
import { record } from "../../src/arbitraries/records.ts";

function noProto<T>(x: Record<string, unknown>): T {
  const result = Object.create(null);
  return Object.assign(result, x) as T;
}

describe("record", () => {
  describe("for an empty record shape", () => {
    const empty = record({});
    it("creates empty records with and without a prototype", () => {
      assertEquals(empty.default, {});
      assertEquals(empty.maxSize, 2);
      assertSolutions(empty, [
        { val: {}, picks: [0] },
        { val: Object.create(null), picks: [1] },
      ]);
    });
  });
  describe("for a constant record shape", () => {
    const example = record({
      a: arb.of(1),
      b: arb.of(2),
    });
    it("reads one pick", () => {
      assertSolutions(example, [
        { val: { a: 1, b: 2 }, picks: [[0]] },
        { val: noProto({ a: 1, b: 2 }), picks: [[1]] },
      ]);
    });
  });
  describe("for a record with a single field", () => {
    const oneField = record({
      a: arb.uniformInt(1, 2),
    });
    it("defaults to using the default value of the field", () => {
      assertParseFails(oneField, []);
    });
  });
  describe("for a record with mutiple fields", () => {
    const example = record({
      a: arb.uniformInt(1, 2),
      b: arb.uniformInt(3, 4),
    });
    it("reads picks ordered by the keys", () => {
      assertSolutions(example, [
        { val: { a: 1, b: 3 }, picks: [[0], 1, 3] },
        { val: { a: 1, b: 4 }, picks: [[0], 1, 4] },
        { val: { a: 2, b: 3 }, picks: [[0], 2, 3] },
        { val: { a: 2, b: 4 }, picks: [[0], 2, 4] },
        { val: noProto({ a: 1, b: 3 }), picks: [[1], 1, 3] },
        { val: noProto({ a: 1, b: 4 }), picks: [[1], 1, 4] },
        { val: noProto({ a: 2, b: 3 }), picks: [[1], 2, 3] },
        { val: noProto({ a: 2, b: 4 }), picks: [[1], 2, 4] },
      ]);
    });
  });
});
