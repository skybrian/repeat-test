import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";
import { assertFirstValues, assertValues } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

describe("uniqueArray", () => {
  const bools = arb.uniqueArray(arb.boolean());
  it("defaults to an empty array", () => {
    assertEquals(bools.default(), []);
  });
  it("generates all combinations of a boolean", () => {
    assertValues(bools, [
      [],
      [false],
      [true],
      [true, false],
      [false, true],
    ]);
  });
  it("rejects impossible filters", () => {
    assertThrows(
      () => bools.filter((v) => v.length > 2),
      Error,
      "filter didn't accept any values",
    );
  });
  it("has a label", () => {
    assertEquals(bools.label, "uniqueArray");
  });
  it("can be configured with a label", () => {
    const array = arb.uniqueArray(arb.int(1, 3), { label: "my array" });
    assertEquals(array.label, "my array");
  });
});

describe("table", () => {
  describe("with one column and no unique key", () => {
    const table = arb.table({ v: arb.boolean() });
    it("defaults to zero rows", () => {
      assertEquals(table.default(), []);
    });
    it("generates every combination of a boolean", () => {
      const combos: boolean[][] = [];
      for (const rows of table.generateAll()) {
        const val = rows.val;
        if (val.length < 2) {
          continue;
        }
        if (val.length > 2) {
          break;
        }
        const bools = rows.val.map((row) => row.v);
        combos.push(bools);
      }
      assertEquals(combos, [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]);
    });
    it("has a label", () => {
      assertEquals(table.label, "table");
    });
    it("can be configured with a label", () => {
      const table = arb.table({ k: arb.int32() }, { label: "my table" });
      assertEquals(table.label, "my table");
    });
  });
  describe("with one column that's a unique key", () => {
    const table = arb.table({ v: arb.boolean() }, { uniqueKey: "v" });
    it("defaults to zero rows", () => {
      assertEquals(table.default(), []);
    });
    it("generates the same values as uniqueArray", () => {
      const expected = arb.uniqueArray(arb.boolean()).map((r) =>
        JSON.stringify(r)
      ).takeAll();
      const actual = table.map((rows) => rows.map((row) => row.v)).map((r) =>
        JSON.stringify(r)
      ).takeAll();
      assertEquals(actual, expected);
    });
  });
  describe("of key-value pairs", () => {
    const table = arb.table({
      k: arb.boolean(),
      v: arb.boolean(),
    }, { uniqueKey: "k" });
    it("starts with zero and one-row tables", () => {
      assertFirstValues(table, [
        [],
        [{ k: false, v: false }],
        [{ k: true, v: false }],
        [{ k: false, v: true }],
        [{ k: true, v: true }],
        [{ k: true, v: false }, { k: false, v: false }],
      ]);
    });
    it("never generates duplicate keys", () => {
      repeatTest(table.filter((t) => t.length > 1), (rows) => {
        const keys = new Set(rows.map((row) => row.k));
        assertEquals(keys.size, rows.length);
      });
    });
  });
});
