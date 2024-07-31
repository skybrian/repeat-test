import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";
import * as dom from "../../src/domains.ts";
import { assertFirstValues, assertValues } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

describe("uniqueArray", () => {
  const bools = arb.uniqueArray(dom.boolean());
  it("defaults to an empty array", () => {
    assertEquals(bools.arbitrary().default(), []);
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
  it("generates unique ids within an integer range", () => {
    const example = arb.from((pick) => {
      const { min, max } = pick(arb.intRange());
      const ids = pick(arb.uniqueArray(dom.int(min, max)));
      return { min, max, ids };
    });
    repeatTest(example, ({ min, max, ids }) => {
      assertEquals(ids.length, new Set(ids).size);
      assert(ids.every((id) => id >= min && id <= max));
    });
  });
  it("generates string identifiers", () => {
    const ids = arb.uniqueArray(dom.wellFormedString());
    repeatTest(ids, (ids) => {
      assertEquals(ids.length, new Set(ids).size);
    });
  });
  it("rejects impossible filters", () => {
    assertThrows(
      () => bools.filter((v) => v.length > 2),
      Error,
      "filter didn't accept any values",
    );
  });
  it("has a label", () => {
    assertEquals(bools.arbitrary().label, "uniqueArray");
  });
  it("can be configured with a label", () => {
    const array = arb.uniqueArray(dom.int(1, 3), { label: "my array" });
    assertEquals(array.arbitrary().label, "my array");
  });
});

describe("table", () => {
  describe("with one column and no unique key", () => {
    const table = arb.table({ v: dom.boolean() });
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
      const table = arb.table({ k: dom.int32() }, { label: "my table" });
      assertEquals(table.label, "my table");
    });
  });
  describe("with one unique column", () => {
    const table = arb.table({ v: dom.boolean() }, { uniqueKeys: ["v"] });
    it("defaults to zero rows", () => {
      assertEquals(table.default(), []);
    });
    it("generates the same values as uniqueArray", () => {
      const expected = arb.uniqueArray(dom.boolean()).arbitrary().map((r) =>
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
      k: dom.boolean(),
      v: dom.boolean(),
    }, { uniqueKeys: ["k"] });
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
  describe("with two unique columns", () => {
    const table = arb.table({
      ids: dom.asciiLetter(),
      ranks: dom.int(1, 5),
    }, { uniqueKeys: ["ids", "ranks"] });
    it("generates unique ids and ranks", () => {
      repeatTest(table, (rows) => {
        const ids = new Set(rows.map((row) => row.ids));
        assertEquals(ids.size, rows.length, "ids should be unique");
        const ranks = new Set(rows.map((row) => row.ranks));
        assertEquals(ranks.size, rows.length, "ranks should be unique");
      });
    });
  });
});
