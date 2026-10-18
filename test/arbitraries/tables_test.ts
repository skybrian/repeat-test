import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertValues,
} from "../lib/asserts.ts";

import { intRange } from "../lib/ranges.ts";
import { takeAll } from "../lib/examples.ts";

describe("uniqueArray", () => {
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
});

describe("table", () => {
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

  describe("with a unique key declared using a KeyShape", () => {
    const row = arb.object({ v: dom.boolean() });
    const table = arb.table(row, { keys: { "v": dom.boolean() } });

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

  describe("with two objects shapes having different string keys", () => {
    it("generates both kinds of rows", () => {
      const row = arb.union<{ id: string }>(
        arb.object({ id: dom.of("A", "B") }),
        arb.object({ id: dom.asciiLetter() }),
      );

      const table = arb.table(row, {
        keys: { "id": dom.string() },
      });

      repeatTest(table, (rows, console) => {
        const ids = new Set(rows.map((row) => row.id));
        assertEquals(ids.size, rows.length, "id should be unique");

        console.sometimes(
          "the first case is picked",
          rows.some((r) => r.id === "a"),
        );

        console.sometimes(
          "the second case is picked",
          rows.some((r) => r.id === "b"),
        );
      });
    });
  });
});
