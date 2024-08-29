import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertValues,
} from "../../src/asserts.ts";
import { takeAll } from "../../src/multipass_search.ts";
import { intRange } from "../../src/arbitraries/ranges.ts";

describe("uniqueArray", () => {
  const bools = arb.uniqueArray(dom.boolean());
  it("defaults to an empty array", () => {
    assertEquals(bools.default().val, []);
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
      const { min, max } = pick(intRange());
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
      "uniqueArray (filtered) didn't generate any values",
    );
  });
  it("has a label", () => {
    assertEquals(bools.label, "uniqueArray");
  });
  it("can be configured with a label", () => {
    const array = arb.uniqueArray(dom.int(1, 3), { label: "my array" });
    assertEquals(array.label, "my array");
  });
});

describe("table", () => {
  it("throws an Error if a unique key isn't a Domain", () => {
    assertThrows(
      () =>
        arb.table({ k: arb.boolean() }, {
          keys: ["k"],
        }),
      Error,
      'field "k" is unique but not a Domain',
    );
  });
  it("throws an Error if min is greater than a boolean domain's size", () => {
    assertThrows(
      () =>
        arb.table({ k: dom.boolean() }, {
          keys: ["k"],
          length: 3,
        }),
      Error,
      `field "k" can't have 3 unique values; want length.min <= 2, got: 3`,
    );
  });
  it("throws an Error if min is greater than a filtered domain's size", () => {
    const justTrue = dom.boolean().filter((v) => v);
    assertThrows(
      () =>
        arb.table({ k: justTrue }, {
          keys: ["k"],
          length: 2,
        }),
      Error,
      `field "k" can't have 2 unique values; want length.min <= 1, got: 2`,
    );
  });
  describe("with one column and no unique key", () => {
    it("defaults to zero rows", () => {
      const table = arb.table({ v: dom.boolean() });
      assertFirstGenerated(table, [{ val: [], picks: [0] }]);
    });
    it("generates every combination of a boolean", () => {
      const table = arb.table({ v: dom.boolean() }, { length: 2 });
      const combos: boolean[][] = [];
      for (const val of takeAll(table)) {
        const bools = val.map((row) => row.v);
        combos.push(bools);
      }
      assertEquals(combos, [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]);
    });
  });
  describe("with one unique column", () => {
    const table = arb.table({ v: dom.boolean() }, { keys: ["v"] });
    it("defaults to zero rows", () => {
      assertEquals(table.default().val, []);
    });
    it("defaults to one row when min is set", () => {
      const table = arb.table({ v: dom.boolean() }, {
        keys: ["v"],
        length: { min: 1 },
      });
      assertEquals(table.default().val.length, 1);
    });
    it("generates the same values as uniqueArray", () => {
      const expected = takeAll(
        arb.uniqueArray(dom.boolean()).map((r) => JSON.stringify(r)),
      );
      function toJSON(rows: { v: boolean }[]): string {
        const values = rows.map((row) => row.v);
        return JSON.stringify(values);
      }
      assertValues(
        table.map(toJSON),
        expected,
      );
    });
  });
  describe("of key-value pairs", () => {
    const table = arb.table({
      k: dom.boolean(),
      v: dom.boolean(),
    }, { keys: ["k"] });
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
    }, { keys: ["ids", "ranks"] });
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
