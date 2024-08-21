import { describe, it } from "@std/testing/bdd";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import * as dom from "../../src/dom.ts";
import { repeatTest } from "../../src/runner.ts";
import { assertThrows } from "@std/assert";
import { Arbitrary } from "../../src/arbitrary_class.ts";

describe("uniqueArray", () => {
  const bools = dom.uniqueArray(dom.boolean());
  it("encodes unique arrays the same way as regular arrays", () => {
    assertEncoding(bools, [0], []);
    assertEncoding(bools, [1, 1, 0], [true]);
    assertEncoding(bools, [1, 0, 1, 1, 0], [false, true]);
  });
  it("round-trips unique arrays", () => {
    repeatTest(bools, (val) => {
      assertRoundTrip(bools, val);
    });
  });
  it("rejects non-arrays", () => {
    assertThrows(() => bools.parse(undefined), Error, "not an array");
  });
  it("rejects an array with an unexpected item", () => {
    const badList = Arbitrary.from((pick) => {
      const list = pick(
        bools.filter((v) => v.length > 0),
      ) as unknown[];
      const badIndex = pick(dom.int(0, list.length - 1));
      list[badIndex] = undefined;
      return { list, badIndex };
    });
    repeatTest(badList, ({ list, badIndex }) => {
      assertThrows(
        () => bools.parse(list),
        Error,
        `${badIndex}: not a boolean`,
      );
    });
  });
  it("rejects an array with a duplicate item", () => {
    const badList = bools.filter((v) => v.length > 0).map((
      v,
    ) => [
      ...v,
      v[0],
    ]);
    repeatTest(badList, (list) => {
      assertThrows(
        () => bools.parse(list),
        Error,
        `${list.length - 1}: duplicate item`,
      );
    });
  });
});

describe("table", () => {
  describe("with no unique columns", () => {
    const table = dom.table({
      a: dom.boolean(),
      b: dom.boolean(),
    });
    it("encodes it the same way as a regular array", () => {
      assertEncoding(table, [0], []);
      assertEncoding(table, [1, 1, 0], [{ a: true, b: true }]);
      assertEncoding(table, [1, 0, 1, 1, 0], [
        { a: true, b: false },
        { a: false, b: true },
      ]);
    });
    it("round-trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });
  });

  describe("with a single unique column", () => {
    const table = dom.table({
      a: dom.boolean(),
    }, { uniqueKeys: ["a"] });
    it("encodes it the same way as a unique array", () => {
      assertEncoding(table, [0], []);
      assertEncoding(table, [1, 1, 0], [{ a: true }]);
      assertEncoding(table, [1, 0, 1, 1, 0], [{ a: false }, { a: true }]);
    });
    it("round-trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });

    it("rejects non-arrays", () => {
      assertThrows(() => table.parse(undefined), Error, "not an array");
    });
    const nonEmpty = table.filter((v) => v.length > 0);
    it("rejects an array with a non-record", () => {
      const hasBadRow = Arbitrary.from((pick) => {
        const list = pick(nonEmpty) as unknown[];
        const badIndex = pick(dom.int(0, list.length - 1));
        list[badIndex] = undefined;
        return { list, badIndex };
      });
      repeatTest(hasBadRow, ({ list, badIndex }) => {
        assertThrows(
          () => table.parse(list),
          Error,
          `${badIndex}: not a record`,
        );
      });
    });
    it("rejects an array with a missing field", () => {
      const hasBadRow = Arbitrary.from((pick) => {
        const list = pick(nonEmpty) as unknown[];
        const badIndex = pick(dom.int(0, list.length - 1));
        list[badIndex] = {};
        return { list, badIndex };
      });
      repeatTest(hasBadRow, ({ list, badIndex }) => {
        assertThrows(
          () => table.parse(list),
          Error,
          `${badIndex}.a: not a boolean`,
        );
      });
    });
    it("rejects an array with an extra field", () => {
      const hasBadRow = Arbitrary.from((pick) => {
        const list = pick(nonEmpty);
        const badIndex = pick(dom.int(0, list.length - 1));
        (list[badIndex] as { other?: unknown }).other = 1;
        return { list, badIndex };
      });
      repeatTest(hasBadRow, ({ list, badIndex }) => {
        assertThrows(
          () => table.parse(list),
          Error,
          `${badIndex}: extra field: other`,
        );
      });
    });
    it("rejects an array with a duplicate field value", () => {
      const hasBadRow = Arbitrary.from((pick) => {
        const list = pick(table.filter((v) => v.length === 2));
        list[1].a = list[0].a;
        return list;
      });
      repeatTest(hasBadRow, (rows) => {
        assertThrows(
          () => table.parse(rows),
          Error,
          `1.a: duplicate field value`,
        );
      });
    });
  });
});
