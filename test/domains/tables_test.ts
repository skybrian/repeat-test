import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { assertEncoding, assertRoundTrip } from "../lib/asserts.ts";

import { repeatTest } from "@/runner.ts";
import { Arbitrary } from "@/arbitrary.ts";
import * as dom from "@/doms.ts";
import { arb } from "@/mod.ts";

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
  it("round-trips arrays with a length constraint", () => {
    const example = Arbitrary.from((pick) => {
      const length = pick(dom.int(0, 2));
      const array = pick(arb.uniqueArray(dom.int32(), { length }));
      return { array, length };
    });
    repeatTest(example, ({ array, length }) => {
      assertRoundTrip(dom.uniqueArray(dom.int32(), { length }), array);
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
        `${badIndex}: not a member of 'boolean'`,
      );
    });
  });
  it("rejects an array with a duplicate item", () => {
    const badList = Arbitrary.from(bools).filter((v) => v.length > 0).map((
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
  it("rejects an array that's too short", () => {
    const example = Arbitrary.from((pick) => {
      const length = pick(dom.int(1, 4));
      const shorter = pick(arb.int(0, length - 1));
      const array = pick(arb.uniqueArray(dom.int32(), { length: shorter }));
      return { array, length };
    });
    repeatTest(example, ({ array, length }) => {
      assertThrows(
        () => dom.uniqueArray(dom.int32(), { length }).parse(array),
        Error,
        `array too short; want len >= ${length}, got: ${array.length}`,
      );
    });
  });
  it("rejects an array that's too long", () => {
    const example = Arbitrary.from((pick) => {
      const length = pick(dom.int(0, 2));
      const longer = pick(arb.int(length + 1, length + 2));
      const array = pick(arb.uniqueArray(dom.int(0, 5), { length: longer }));
      return { array, length };
    });
    repeatTest(example, ({ array, length }) => {
      assertThrows(
        () => dom.uniqueArray(dom.int(0, 5), { length }).parse(array),
        Error,
        `array too long; want len <= ${length}, got: ${array.length}`,
      );
    });
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
    it("round-trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });
  });

  describe("with no unique columns and a length constraint", () => {
    it("round-trips generated tables", () => {
      const example = Arbitrary.from((pick) => {
        const length = pick(dom.int(0, 2));
        const array = pick(dom.table(pair, { length }));
        return { array, length };
      });
      repeatTest(example, ({ array, length }) => {
        assertRoundTrip(
          dom.table(pair, { length }),
          array,
        );
      });
    });

    it("rejects an array that's too short", () => {
      const example = Arbitrary.from((pick) => {
        const length = pick(dom.int(1, 5));
        const shorter = pick(arb.int(0, length - 1));
        const array = pick(dom.table(pair, { length: shorter }));
        return { array, length };
      });
      repeatTest(example, ({ array, length }) => {
        assertThrows(
          () => dom.table(pair, { length }).parse(array),
          Error,
          `array too short; want len >= ${length}, got: ${array.length}`,
        );
      });
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
    it("round-trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });

    it("rejects non-arrays", () => {
      assertThrows(() => table.parse(undefined), Error, "not an array");
    });
    const nonEmpty = table.filter((v) => v.length > 0);
    it("rejects an array with a non-object", () => {
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
          `${badIndex}: not an object`,
        );
      });
    });
    it("rejects an array when an item has a missing property", () => {
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
          `${badIndex}.a: not a member of 'boolean'`,
        );
      });
    });
    it("matchs an array when an item has an extra property", () => {
      const hasExtra = Arbitrary.from((pick) => {
        const expected = pick(nonEmpty);
        const extraIndex = pick(dom.int(0, expected.length - 1));

        const extra = nonEmpty.parse(expected);
        (extra[extraIndex] as { other?: unknown }).other = 1;
        return { extra, expected };
      });
      repeatTest(hasExtra, ({ extra, expected }) => {
        assertEquals(table.parse(extra), expected);
      });
    });
    it("rejects an array when there is a duplicate value in a column that should be unique", () => {
      const hasBadRow = Arbitrary.from((pick) => {
        const list = pick(table.filter((v) => v.length === 2));
        list[1].a = list[0].a;
        return list;
      });
      repeatTest(hasBadRow, (rows) => {
        assertThrows(
          () => table.parse(rows),
          Error,
          `1.a: duplicate value found for unique key`,
        );
      });
    });
  });

  describe("with two row shapes", () => {
    const id = dom.int(1, 10);

    type RowType =
      | { id: number; kind: "number"; value: number }
      | { id: number; kind: "string"; value: string };

    const row = dom.taggedUnion<RowType>("kind", [
      dom.object<RowType>({
        id,
        kind: dom.of("string"),
        value: dom.string(),
      }),
      dom.object<RowType>({
        id,
        kind: dom.of("number"),
        value: dom.int(1, 10),
      }),
    ]);

    const table = dom.table(row, { keys: ["id"] });

    it("round trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });

    it("rejects an array with a non-object", () => {
      const invalid = [1, 2, 3];
      assertThrows(
        () => table.parse(invalid as unknown as RowType[]),
        Error,
        `0: not an object`,
      );
    });
  });

  describe("with two row shapes that have constant props", () => {
    type RowType = { kind: "one"; val: 1 } | { kind: "two"; val: 2 };

    const row = dom.taggedUnion<RowType>("kind", [
      dom.object<RowType>({ kind: dom.of("one"), val: dom.of(1) }),
      dom.object<RowType>({ kind: dom.of("two"), val: dom.of(2) }),
    ]);

    const table = dom.table(row);

    it("round trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      });
    });

    it("encodes the table using case indexes only", () => {
      assertEncoding(table, [1, 0, 1, 1, 0], [{ kind: "one", val: 1 }, {
        kind: "two",
        val: 2,
      }]);
    });

    it("rejects a row that doesn't match either shape", () => {
      assertThrows(
        () => table.parse([{ kind: "three", val: 3 }]),
        Error,
        `tags didn't match any case in 'taggedUnion'`,
      );
    });
  });

  describe("with a key-value pair", () => {
    const row = dom.object({
      key: dom.string(),
      value: dom.string(),
    });
    const table = dom.table(row, { keys: ["key"] });

    it("round trips generated tables", () => {
      repeatTest(table, (rows) => {
        assertRoundTrip(table, rows);
      }, { reps: 10 });
    });

    it("rejects a table with a bad value", () => {
      assertThrows(
        () => table.parse([{ key: "a", value: 1 }]),
        Error,
        "[key=a].value: not a string",
      );
    });
  });

  it("throws if a unique key isn't defined", () => {
    assertThrows(
      () => dom.table(dom.object({}), { keys: ["id"] }),
      Error,
      "unique key 'id' not defined",
    );
  });

  it("throws for a union with inconsistent id types", () => {
    const row = dom.taggedUnion<{ id: number; kind: "a" | "b" }>(
      "kind",
      [
        dom.object({ id: dom.int(1, 10), kind: dom.of("a") }),
        dom.object({ id: dom.int(11, 20), kind: dom.of("b") }),
      ],
    );

    assertThrows(
      () => dom.table(row, { keys: ["id"] }),
      Error,
      "unique key 'id' not defined the same way in each case",
    );
  });
});
