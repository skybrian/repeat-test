import { describe, it } from "@std/testing/bdd";
import { assertEncoding } from "../lib/asserts.ts";

import * as dom from "@/doms.ts";

describe("uniqueArray", () => {
  const bools = dom.uniqueArray(dom.boolean());

  it("encodes unique arrays the same way as regular arrays", () => {
    assertEncoding(bools, [0], []);
    assertEncoding(bools, [1, 1, 0], [true]);
    assertEncoding(bools, [1, 0, 1, 1, 0], [false, true]);
  });
});

describe("table", () => {
  const pair = dom.object({
    a: dom.boolean(),
    b: dom.boolean(),
  });

  describe("with no unique columns", () => {
    const table = dom.table(pair);
    it("encodes it the same way as a regular array", () => {
      assertEncoding(table, [0], []);
      assertEncoding(table, [1, 1, 0], [{ a: true, b: true }]);
      assertEncoding(table, [1, 0, 1, 1, 0], [
        { a: true, b: false },
        { a: false, b: true },
      ]);
    });
  });

  describe("with a single unique column", () => {
    const row = dom.object({
      a: dom.boolean(),
    });
    const table = dom.table(row, { keys: ["a"] });
    it("encodes it the same way as a unique array", () => {
      assertEncoding(table, [0], []);
      assertEncoding(table, [1, 1, 0], [{ a: true }]);
      assertEncoding(table, [1, 0, 1, 1, 0], [{ a: false }, { a: true }]);
    });
  });

  describe("with two row shapes that have constant props", () => {
    type RowType = { kind: "one"; val: 1 } | { kind: "two"; val: 2 };

    const row = dom.taggedUnion<RowType>("kind", [
      dom.object<RowType>({ kind: dom.of("one"), val: dom.of(1) }),
      dom.object<RowType>({ kind: dom.of("two"), val: dom.of(2) }),
    ]);
    const table = dom.table(row);

    it("encodes the table using case indexes only", () => {
      assertEncoding(table, [1, 0, 1, 1, 0], [{ kind: "one", val: 1 }, {
        kind: "two",
        val: 2,
      }]);
    });
  });
});
