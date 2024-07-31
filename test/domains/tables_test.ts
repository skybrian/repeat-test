import { describe, it } from "jsr:@std/testing@^0.225.1/bdd";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import * as dom from "../../src/domains.ts";
import { repeatTest } from "../../src/runner.ts";
import { assertThrows } from "jsr:@std/assert@^1.0.0-rc.1/assert-throws";
import Arbitrary from "../../src/arbitrary_class.ts";

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
        bools.arbitrary.filter((v) => v.length > 0),
      ) as unknown[];
      const badIndex = pick(dom.int(0, list.length - 1));
      list[badIndex] = undefined;
      return { list, badIndex };
    });
    repeatTest(badList, ({ list, badIndex }) => {
      console.log({ list, badIndex });
      assertThrows(
        () => bools.parse(list),
        Error,
        `${badIndex}: not a boolean`,
      );
    }, { only: "568396397:6" });
  });
  it("rejects an array with a duplicate item", () => {
    const badList = bools.arbitrary.filter((v) => v.length > 0).map((
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
