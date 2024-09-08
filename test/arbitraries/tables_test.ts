import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertValues,
} from "../lib/asserts.ts";
import { generateDefault, takeAll } from "../../src/multipass_search.ts";
import { intRange } from "../lib/ranges.ts";

describe("uniqueArray", () => {
  it("defaults to an empty array", () => {
    const bools = arb.uniqueArray(dom.boolean());
    assertEquals(generateDefault(bools).val, []);
  });
  it("defaults to a larger array when min is set", () => {
    const bools = arb.uniqueArray(dom.boolean(), { length: { min: 1 } });
    assertEquals(generateDefault(bools).val.length, 1);
  });
  it("generates all combinations of a boolean", () => {
    const bools = arb.uniqueArray(dom.boolean());
    assertValues(bools, [
      [],
      [false],
      [true],
      [false, true],
      [true, false],
    ]);
  });
  it("generates shorter arrays when max is set", () => {
    const bools = arb.uniqueArray(dom.boolean(), { length: { max: 1 } });
    assertValues(bools, [
      [],
      [false],
      [true],
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
    const bools = arb.uniqueArray(dom.boolean());
    assertThrows(
      () => bools.filter((v) => v.length > 2),
      Error,
      "uniqueArray filter didn't allow enough values through; want: 1 of 5, got: 0",
    );
  });
  it("rejects an impossible minimum size", () => {
    assertThrows(
      () => arb.uniqueArray(dom.boolean(), { length: { min: 3 } }),
      Error,
      "not enough unique values; want length.min <= 2, got: 3",
    );
  });
  it("has a label", () => {
    const bools = arb.uniqueArray(dom.boolean());
    assertEquals(bools.label, "uniqueArray");
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
  it("rejects an impossible minimum size", () => {
    const justTrue = dom.boolean().filter((v) => v);
    assertThrows(
      () =>
        arb.table({ k: justTrue }, {
          keys: ["k"],
          length: 2,
        }),
      Error,
      `field "k": not enough unique keys; want length.min <= 1, got: 2`,
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
      assertEquals(generateDefault(table).val, []);
    });
    it("defaults to one row when min is set", () => {
      const table = arb.table({ v: dom.boolean() }, {
        keys: ["v"],
        length: { min: 1 },
      });
      assertEquals(generateDefault(table).val.length, 1);
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
        [{ k: false, v: false }, { k: true, v: false }],
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
