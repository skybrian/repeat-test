import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import * as arb from "@skybrian/repeat-test/arbs";
import * as dom from "@skybrian/repeat-test/doms";
import { generateDefault, repeatTest } from "@skybrian/repeat-test/runner";

describe("arb.uniqueArray", () => {
  it("has an empty default unless a minimum length is requested", () => {
    const bools = arb.uniqueArray(dom.boolean());
    deepStrictEqual(generateDefault(bools).val, []);
    strictEqual(bools.name, "uniqueArray");
    strictEqual(
      generateDefault(arb.uniqueArray(dom.boolean(), { length: { min: 1 } }))
        .val.length,
      1,
    );
  });

  it("generates unique string identifiers", () => {
    const ids = arb.uniqueArray(dom.wellFormedString({ length: 4 }), {
      length: { max: 4 },
    });
    repeatTest(ids, (ids) => {
      strictEqual(ids.length <= 4, true);
      strictEqual(ids.every((id) => id.length === 4), true);
      strictEqual(new Set(ids).size, ids.length);
    }, { reps: 20 });
  });

  it("defaults to two distinct string identifiers with a fixed length", () => {
    const ids = arb.uniqueArray(dom.of("aaaa", "bbbb", "cccc"), { length: 2 });
    deepStrictEqual(generateDefault(ids).val, ["aaaa", "bbbb"]);
  });

  it("rejects impossible filters", () => {
    throws(() => arb.uniqueArray(dom.boolean()).filter((v) => v.length > 2), {
      name: "Error",
      message:
        "filter on 'uniqueArray' didn't allow enough values through; want: 1 of 5, got: 0",
    });
  });

  it("rejects an impossible minimum length", () => {
    throws(() => arb.uniqueArray(dom.boolean(), { length: { min: 3 } }), {
      name: "Error",
      message: "not enough unique values; want length.min <= 2, got: 3",
    });
  });
});

describe("arb.table key validation", () => {
  it("requires Domain columns for a list of keys", () => {
    throws(() => arb.table(arb.object({ k: arb.boolean() }), { keys: ["k"] }), {
      name: "Error",
      message:
        "property 'k' is declared a unique key, but not defined as a Domain",
    });
  });

  it("requires Domain columns even when a key shape supplies a Domain", () => {
    throws(
      () =>
        arb.table(arb.object({ k: arb.boolean() }), {
          keys: { k: dom.boolean() },
        }),
      {
        name: "Error",
        message:
          "property 'k' is declared a unique key, but not defined as a Domain",
      },
    );
  });

  it("requires Domain columns in every union case", () => {
    const invalidFirst = arb.union<{ k: boolean } | { k: number }>(
      arb.object({ k: arb.boolean() }),
      arb.object({ k: dom.int(1, 2) }),
    );
    const invalidLater = arb.union<{ k: boolean } | { k: number }>(
      arb.object({ k: dom.boolean() }),
      arb.object({ k: arb.int(1, 2) }),
    );
    for (const row of [invalidFirst, invalidLater]) {
      throws(() => arb.table(row, { keys: ["k"] }), {
        name: "Error",
        message:
          "property 'k' is declared a unique key, but not defined as a Domain",
      });
    }
  });

  it("rejects impossible minimum sizes with singular and plural diagnostics", () => {
    const justTrue = dom.boolean().filter((v) => v);
    throws(
      () => arb.table(arb.object({ k: justTrue }), { keys: ["k"], length: 2 }),
      {
        name: "Error",
        message: "property 'k' has 1 unique value, but length.min is 2",
      },
    );
    throws(
      () =>
        arb.table(arb.object({ k: dom.boolean() }), { keys: ["k"], length: 3 }),
      {
        name: "Error",
        message: "property 'k' has 2 unique values, but length.min is 3",
      },
    );
  });
});

describe("arb.table generation", () => {
  it("defaults to zero rows or the requested minimum", () => {
    const row = arb.object({ v: dom.boolean() });
    deepStrictEqual(generateDefault(arb.table(row, { keys: ["v"] })).val, []);
    strictEqual(
      generateDefault(arb.table(row, { keys: ["v"], length: { min: 1 } }))
        .val.length,
      1,
    );
  });

  it("fills a fixed-length table with unique keys and non-key values", () => {
    const table = arb.table(
      arb.object({ k: dom.boolean(), v: dom.boolean() }),
      { keys: ["k"], length: 2 },
    );
    repeatTest(table, (rows) => {
      strictEqual(rows.length, 2);
      strictEqual(new Set(rows.map((row) => row.k)).size, 2);
      strictEqual(rows.every((row) => typeof row.v === "boolean"), true);
    }, { reps: 20 });
  });

  it("fills a fixed-length table using a key shape", () => {
    const table = arb.table(
      arb.object({ k: dom.int(1, 3) }),
      { keys: { k: dom.int(1, 3) }, length: 3 },
    );
    repeatTest(table, (rows) => {
      deepStrictEqual(rows.map((row) => row.k).sort(), [1, 2, 3]);
    }, { reps: 20 });
  });

  it("generates unique keys shared by overlapping union cases", () => {
    const row = arb.union<{ k: number }>(
      arb.object({ k: dom.int(1, 2) }),
      arb.object({ k: dom.int(2, 3) }),
    );
    const table = arb.table(row, {
      keys: { k: dom.int(1, 3) },
      length: 3,
    });
    repeatTest(table, (rows) => {
      deepStrictEqual(rows.map((row) => row.k).sort(), [1, 2, 3]);
    }, { reps: 20 });
  });

  it("counts only distinct union keys accepted by the common key Domain", () => {
    const row = arb.union<{ k: number }>(
      arb.object({ k: dom.of(0, 1) }),
      arb.object({ k: dom.of(1, 2) }),
    );
    const table = arb.table(row, {
      keys: { k: dom.of(1, 2) },
      length: 2,
    });
    repeatTest(table, (rows) => {
      deepStrictEqual(rows.map((row) => row.k).sort(), [1, 2]);
    }, { reps: 20 });
  });

  it("generates unique values in two key columns", () => {
    const table = arb.table(
      arb.object({ id: dom.asciiLetter(), rank: dom.int(1, 5) }),
      { keys: ["id", "rank"], length: 3 },
    );
    repeatTest(table, (rows) => {
      strictEqual(rows.length, 3);
      strictEqual(new Set(rows.map((row) => row.id)).size, rows.length);
      strictEqual(new Set(rows.map((row) => row.rank)).size, rows.length);
    }, { reps: 20 });
  });
});
