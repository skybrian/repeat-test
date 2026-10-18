import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as dom from "@/doms.ts";

import { assertEncoding, assertSometimes } from "../lib/asserts.ts";
import { minMaxVal } from "../lib/ranges.ts";
import { MutableGen } from "../../src/gen_class.ts";

describe("boolean", () => {
  const bool = dom.boolean();
  it("encodes booleans", () => {
    assertEncoding(bool, [0], false);
    assertEncoding(bool, [1], true);
  });
});

describe("int", () => {
  it("encodes values as themselves when the domain excludes negative numbers", () => {
    for (let i = 1; i <= 6; i++) {
      assertEncoding(dom.int(1, 6), [i], i);
    }
  });
  it("encodes values by negating them when the domain excludes positive numbers", () => {
    for (let i = -6; i <= -1; i++) {
      assertEncoding(dom.int(-6, -1), [-i], i);
    }
  });
  it("encodes values as a sign and magnitude when the domain includes both positive and negative numbers", () => {
    const signed = dom.int(-3, 3);
    for (let i = 0; i <= 3; i++) {
      assertEncoding(signed, [0, i], i);
    }
    for (let i = -3; i < 0; i++) {
      assertEncoding(signed, [1, -i], i);
    }
  });
});

describe("array", () => {
  describe("for a variable-length array", () => {
    const arr = dom.array(dom.int(1, 3));
    it("writes a zero for the end of an array", () => {
      assertEncoding(arr, [0], []);
    });
    it("writes a one to start each item", () => {
      assertEncoding(arr, [1, 2, 0], [2]);
      assertEncoding(arr, [1, 2, 1, 3, 0], [2, 3]);
    });
    it("has one more group than the size of the array", () => {
      const gen = arr.regenerate([1, 2, 3]);
      assert(gen.ok);
      assertEquals(MutableGen.from(gen).groupKeys.length, gen.val.length + 1);
    });
  });
  describe("with a maximum length", () => {
    const arr = dom.array(dom.int(1, 3), { length: { max: 2 } });
    it("doesn't write a zero at max length", () => {
      assertEncoding(arr, [1, 2], [1, 2]);
    });
  });
  describe("with a fixed-length array", () => {
    const arr = dom.array(dom.int(1, 3), { length: 2 });
    it("encodes the items without prefixes", () => {
      assertEncoding(arr, [2, 3], [2, 3]);
    });
  });
});

describe("firstOf", () => {
  describe("for a single case", () => {
    it("encodes it the same way as the child domain", () => {
      repeatTest(minMaxVal(), ({ min, max, val }) => {
        const child = dom.int(min, max);
        const ignore = () => {};
        const expected = child.innerPickify(val, ignore);
        assert(expected !== undefined);
        assertEncoding(dom.firstOf(child), expected, val);
      });
    });
  });
  describe("for multiple cases", () => {
    it("encodes distinct cases by putting the case index first", () => {
      const multiWay = dom.firstOf(dom.int(1, 3), dom.int(4, 6));
      assertEncoding(multiWay, [0, 2], 2);
      assertEncoding(multiWay, [1, 5], 5);
    });
    it("chooses evenly between two cases", () => {
      const ab = dom.firstOf(dom.of("a"), dom.of("b"));
      assertSometimes(ab, (v) => v === "a", 45, 55);
    });
    it("usually chooses the case with more weight", () => {
      const ab = dom.firstOf(dom.of("a").with({ weight: 3 }), dom.of("b"));
      assertSometimes(ab, (v) => v === "a", 70, 80);
    });
  });
});

describe("for a nested firstOf", () => {
  const undef = dom.of(undefined).with({ name: "undefined" });
  const nested = dom.firstOf(dom.int(1, 3), dom.firstOf(undef, dom.int(4, 5)));
  it("encodes the choices made in order", () => {
    assertEncoding(nested, [0, 1], 1);
    assertEncoding(nested, [1, 0], undefined);
    assertEncoding(nested, [1, 1, 5], 5);
  });
});
