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
import { generateDefault, takeAll } from "../../src/ordered.ts";
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
  it("sometimes generates short and max lengths", () => {
    const ids = arb.uniqueArray(dom.int(1, 1000));
    repeatTest(ids, (ids, console) => {
      for (let len = 0; len < 20; len++) {
        console.sometimes(`length is ${len}`, ids.length === len);
      }
      console.sometimes(`length is 1000`, ids.length === 1000);
    });
  });
  it("generates string identifiers", () => {
    // TODO: this is too slow for longer strings
    const ids = arb.uniqueArray(dom.wellFormedString({ length: 4 }));
    repeatTest(ids, (ids) => {
      assertEquals(ids.length, new Set(ids).size);
    });
  });
  it("rejects impossible filters", () => {
    const bools = arb.uniqueArray(dom.boolean());
    assertThrows(
      () => bools.filter((v) => v.length > 2),
      Error,
      "filter on 'uniqueArray' didn't allow enough values through; want: 1 of 5, got: 0",
    );
  });
  it("rejects an impossible minimum size", () => {
    assertThrows(
      () => arb.uniqueArray(dom.boolean(), { length: { min: 3 } }),
      Error,
      "not enough unique values; want length.min <= 2, got: 3",
    );
  });
  it("has a name", () => {
    const bools = arb.uniqueArray(dom.boolean());
    assertEquals(bools.name, "uniqueArray");
  });
});

describe("table", () => {
  describe("for an object row", () => {
    it("throws an Error if a unique key isn't a Domain", () => {
      const row = arb.object({ k: arb.boolean() });
      assertThrows(
        () => arb.table(row, { keys: ["k"] }),
        Error,
        "property 'k' is declared unique but not specified by a Domain",
      );
    });
  });

  describe("for a union row", () => {
    it("throws an Error if a unique key isn't a Domain", () => {
      const row = arb.union<{ k: boolean } | { k: number }>(
        arb.object({ k: arb.boolean() }),
        arb.object({ k: arb.int(1, 100) }),
      );
      assertThrows(
        () => arb.table(row, { keys: ["k"] }),
        Error,
        "property 'k' is declared unique but not specified by a Domain",
      );
    });

    it("throws an Error if a unique key isn't the same in all cases", () => {
      const row = arb.union<{ k: number }>(
        arb.object({ k: dom.int(1, 10) }),
        arb.object({ k: dom.int(1, 11) }),
      );
      assertThrows(
        () => arb.table(row, { keys: ["k"] }),
        Error,
        "property 'k' is declared unique, but case 1 doesn't match case 0",
      );
    });
  });

  it("rejects impossible minimum sizes", () => {
    const justTrue = dom.boolean().filter((v) => v);
    const row = arb.object({ k: justTrue });
    assertThrows(
      () => arb.table(row, { keys: ["k"], length: 2 }),
      Error,
      "property 'k' has 1 unique value, but length.min is 2",
    );
    const row2 = arb.object({ k: dom.boolean() });
    assertThrows(
      () => arb.table(row2, { keys: ["k"], length: 3 }),
      Error,
      "property 'k' has 2 unique values, but length.min is 3",
    );
  });

  describe("with one column and no unique key", () => {
    const row = arb.object({ v: dom.boolean() });

    it("defaults to zero rows", () => {
      assertFirstGenerated(arb.table(row), [{ val: [], picks: [0] }]);
    });
    it("generates every combination of a boolean", () => {
      const table = arb.table(row, { length: 2 });
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
    it("sometimes generates short and max lengths", () => {
      const table = arb.table(row);
      repeatTest(table, (table, console) => {
        for (let len = 0; len < 20; len++) {
          console.sometimes(`length is ${len}`, table.length === len);
        }
        console.sometimes(`length is 1000`, table.length === 1000);
      });
    });
  });

  describe("with one unique column", () => {
    const row = arb.object({ v: dom.boolean() });
    const table = arb.table(row, { keys: ["v"] });

    it("defaults to zero rows", () => {
      assertEquals(generateDefault(table).val, []);
    });

    it("defaults to one row when min is set", () => {
      const table = arb.table(row, { keys: ["v"], length: { min: 1 } });
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
    const table = arb.table(
      arb.object({
        k: dom.boolean(),
        v: dom.boolean(),
      }),
      { keys: ["k"] },
    );

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

    it("sometimes generates short and max lengths", () => {
      const table = arb.table(
        arb.object({
          k: dom.int(1, 1000),
          v: dom.boolean(),
        }),
        { keys: ["k"] },
      );
      repeatTest(table, (table, console) => {
        for (let len = 0; len < 20; len++) {
          console.sometimes(`length is ${len}`, table.length === len);
        }
        console.sometimes(`length is 1000`, table.length === 1000);
      });
    });
  });

  describe("with two unique columns", () => {
    const table = arb.table(
      arb.object({
        id: dom.asciiLetter(),
        rank: dom.int(1, 5),
      }),
      { keys: ["id", "rank"] },
    );

    it("generates unique ids and ranks", () => {
      repeatTest(table, (rows) => {
        const ids = new Set(rows.map((row) => row.id));
        assertEquals(ids.size, rows.length, "id should be unique");
        const ranks = new Set(rows.map((row) => row.rank));
        assertEquals(ranks.size, rows.length, "rank should be unique");
      });
    });
  });

  describe("with two object shapes having a common, unique key", () => {
    const id = dom.of(1, 2, 3);
    const row = arb.union<
      { id: number; name: string } | { id: number; color: string }
    >(
      arb.object({
        id,
        name: arb.string(),
      }),
      arb.object({
        id,
        color: arb.of("red", "green", "blue"),
      }),
    );

    const table = arb.table(row, { keys: ["id"] });

    it("generates both kinds of rows", () => {
      repeatTest(table, (rows, console) => {
        const ids = new Set(rows.map((row) => row.id));
        assertEquals(ids.size, rows.length, "id should be unique");

        console.sometimes(
          "the first case is picked",
          rows.some((r) => Object.keys(r).includes("name")),
        );

        console.sometimes(
          "the second case is picked",
          rows.some((r) => Object.keys(r).includes("color")),
        );
      });
    });
  });
});
