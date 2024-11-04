import type { PropShape } from "@/domain.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as dom from "@/doms.ts";

import { assertEncoding, assertRoundTrip } from "../lib/asserts.ts";
import { intRange, invalidIntRange, minMaxVal } from "../lib/ranges.ts";
import { MutableGen } from "../../src/gen_class.ts";
import { Domain, ParseError } from "@/domain.ts";

describe("of", () => {
  describe("for a single-item domain", () => {
    const one = dom.of(1);
    it("accepts a constant value", () => {
      assertRoundTrip(one, 1);
    });
    it("rejects items not passed in as arguments", () => {
      assertThrows(
        () => one.parse(2),
        ParseError,
        "doesn't match '1 (constant)'",
      );
    });
  });
  it("rejects items not passed in as arguments", () => {
    const items = dom.of(1, 2, 3);
    assertThrows(() => items.parse(4), Error, "not a member of '3 examples'");
  });
  it("uses a name added later in error messages", () => {
    const items = dom.of(1, 2, 3).with({ name: "digit" });
    assertThrows(() => items.parse(4), Error, "not a member of 'digit'");
  });

  it("automatically names simple constants", () => {
    assertEquals(dom.of(undefined).name, "undefined (constant)");
    assertEquals(dom.of(1).name, "1 (constant)");
    assertEquals(dom.of("hello").name, `"hello" (constant)`);
  });
});

describe("alias", () => {
  type Child = string | Tree;
  type Tree = { left: Child; right: Child };

  const child: Domain<Tree> = Domain.alias(() => tree);

  const tree: Domain<Tree> = dom.object({
    left: dom.firstOf<Child>(dom.string(), child),
    right: dom.firstOf<Child>(dom.string(), child),
  });

  it("round-trips trees", () => {
    const tree = {
      left: { left: "a", right: "b" },
      right: { left: "c", right: "d" },
    };
    assertRoundTrip(child, tree);
  });
});

describe("boolean", () => {
  const bool = dom.boolean();
  it("encodes booleans", () => {
    assertEncoding(bool, [0], false);
    assertEncoding(bool, [1], true);
  });
  it("rejects non-booleans", () => {
    assertThrows(
      () => bool.parse(undefined),
      ParseError,
      "not a member of 'boolean'",
    );
  });
});

describe("int", () => {
  it("throws when given an invalid range", () => {
    repeatTest(invalidIntRange(), ({ min, max }) => {
      assertThrows(() => dom.int(min, max));
    });
  });

  it("round-trips integers for any valid range", () => {
    repeatTest(minMaxVal(), ({ min, max, val }) => {
      assertRoundTrip(dom.int(min, max), val);
    });
  });

  it("rejects integers outside the given range", () => {
    repeatTest(intRange({ minMin: -100 }), ({ min, max }) => {
      const ints = dom.int(min, max);
      assertThrows(() => ints.parse("hi"), Error, "not a safe integer");
      assertThrows(() => ints.parse(min - 1), Error, "not in range");
      assertThrows(() => ints.parse(max + 1), Error, "not in range");
    });
  });

  it("regenerates the original value", () => {
    repeatTest(minMaxVal(), ({ min, max, val }) => {
      const ints = dom.int(min, max);
      assertEquals(ints.parse(val), val);
    });
  });

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

describe("object", () => {
  describe("constructor", () => {
    it("throws errors for bad arguments", () => {
      assertThrows(
        () => dom.object(undefined as unknown as PropShape<unknown>),
        Error,
      );
      assertThrows(
        () => dom.object({ a: "b" } as PropShape<unknown>),
        Error,
      );
    });
  });

  describe("parse", () => {
    describe("with default settings", () => {
      const anyObject = dom.object({});
      const pair = dom.object({ a: dom.int(0, 1), b: dom.int(0, 1) });

      it("rejects non-objects", () => {
        assertThrows(() => anyObject.parse(undefined), Error, "not an object");
        assertThrows(() => anyObject.parse(null), Error, "not an object");
      });

      it("accepts an object with an extra property", () => {
        assertEquals(anyObject.parse({ a: 0 }), {});
        assertEquals(pair.parse({ a: 0, b: 0, c: "extra" }), { a: 0, b: 0 });
      });

      it("rejects an object with a missing property", () => {
        assertThrows(
          () => pair.parse({ a: 0 }),
          ParseError,
          "b: not a safe integer",
        );
      });

      it("rejects an object with a property that doesn't match", () => {
        const rec = dom.object({ a: dom.int(0, 1) });
        assertThrows(() => rec.parse({ a: 2 }), Error, "a: not in range");
      });
    });

    describe("with the strict flag set to true", () => {
      const justA = dom.object({ a: dom.of(0) }, { strict: true });

      it("accepts an object with the same properties", () => {
        assertEquals(justA.parse({ a: 0 }), { a: 0 });
      });

      it("rejects an object with extra properties", () => {
        assertThrows(
          () => justA.parse({ a: 0, b: "extra" }),
          Error,
          "extra field: b",
        );
      });
    });
  });

  it("round-trips generated objects", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const obj = dom.object(shape);
    repeatTest(obj, (val) => {
      assertRoundTrip(obj, val);
    });
  });

  it("encodes objects as a sequence of encoded properties", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const rec = dom.object(shape);
    assertEncoding(rec, [1, 6], { a: 1, b: 6 });
  });

  describe("for an object with a property that's an alias", () => {
    const alias = dom.alias(() => {
      throw new Error("should not be called");
    });

    it("shouldn't call the alias when defined", () => {
      dom.object({
        a: dom.int(1, 2),
        b: alias,
      });
    });
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

    it("rejects non-arrays", () => {
      assertThrows(() => arr.parse(undefined), ParseError, "not an array");
      assertThrows(() => arr.parse(0), ParseError, "not an array");
    });

    it("rejects arrays with an invalid item", () => {
      assertThrows(() => arr.parse([1, 0]), ParseError, "1: not in range");
    });

    it("has one more group than the size of the array", () => {
      const gen = arr.regenerate([1, 2, 3]);
      assert(gen.ok);
      assertEquals(MutableGen.from(gen).groupKeys.length, gen.val.length + 1);
    });
  });

  describe("with a minimum length", () => {
    const arr = dom.array(dom.int(1, 3), { length: { min: 2 } });
    it("rejects arrays that are too short", () => {
      assertThrows(
        () => arr.parse([1]),
        ParseError,
        "array too short; want len >= 2, got: 1",
      );
    });
  });

  describe("with a maximum length", () => {
    const arr = dom.array(dom.int(1, 3), { length: { max: 2 } });

    it("rejects arrays that are too long", () => {
      assertThrows(
        () => arr.parse([1, 2, 3]),
        ParseError,
        "array too long; want len <= 2, got: 3",
      );
    });

    it("doesn't write a zero at max length", () => {
      assertEncoding(arr, [1, 2], [1, 2]);
    });
  });

  describe("with a fixed-length array", () => {
    const arr = dom.array(dom.int(1, 3), { length: 2 });
    it("encodes the items without prefixes", () => {
      assertEncoding(arr, [2, 3], [2, 3]);
    });
    it("rejects arrays of the wrong length", () => {
      assertThrows(() => arr.parse([]), ParseError, "array too short");
      assertThrows(() => arr.parse([1, 2, 3]), ParseError, "array too long");
    });
    it("rejects arrays with an invalid item", () => {
      assertThrows(() => arr.parse([2, 0]), ParseError, "1: not in range");
    });
  });
});

describe("firstOf", () => {
  it("throws when given an empty array", () => {
    assertThrows(() => dom.firstOf(), Error, "firstOf: no cases");
  });

  describe("for a single case", () => {
    it("encodes it the same way as the child domain", () => {
      repeatTest(minMaxVal(), ({ min, max, val }) => {
        const child = dom.int(min, max);
        const ignore = () => {};
        const expected = child.innerPickify(val, ignore);
        assert(expected !== undefined);
        const oneWay = dom.firstOf(child);
        assertEncoding(oneWay, expected, val);
      });
    });

    it("rejects values that don't match", () => {
      const child = dom.int(1, 3);
      const oneWay = dom.firstOf(child);
      assertThrows(() => oneWay.parse(0), ParseError, "not in range");
    });
  });

  describe("for multiple cases", () => {
    const multiWay = dom.firstOf(dom.int(1, 3), dom.int(4, 6));

    it("encodes distinct cases by putting the case index first", () => {
      assertEncoding(multiWay, [0, 2], 2);
      assertEncoding(multiWay, [1, 5], 5);
    });

    it("throws a ParseError with a nice message", () => {
      assertThrows(
        () => multiWay.parse(0),
        ParseError,
        `no case matched:
  not in range [1, 3]
  not in range [4, 6]
`,
      );
    });

    it("reports its own name an errors if it's not untitled", () => {
      const named = dom.firstOf(dom.int(1, 3), dom.int(4, 6)).with({
        name: "named",
      });
      assertThrows(
        () => named.parse(0),
        ParseError,
        `no case matched 'named':
  not in range [1, 3]
  not in range [4, 6]
`,
      );
    });

    it("prints error locations when the mismatch is in a nested domain", () => {
      const example = dom.firstOf(
        dom.array(dom.int(1, 3)),
        dom.array(dom.int(4, 5)),
      );
      assertThrows(
        () => example.parse([0]),
        ParseError,
        `no case matched:
  0: not in range [1, 3]
  0: not in range [4, 5]
`,
      );
    });
  });

  describe("for a nested firstOf", () => {
    const undef = dom.of(undefined).with({ name: "undefined" });

    const nested = dom.firstOf(
      dom.int(1, 3),
      dom.firstOf(undef, dom.int(4, 5)),
    );

    it("encodes the choices made in order", () => {
      assertEncoding(nested, [0, 1], 1);
      assertEncoding(nested, [1, 0], undefined);
      assertEncoding(nested, [1, 1, 5], 5);
    });

    it("prints nested error locations when no case matches", () => {
      assertThrows(
        () => nested.parse(42),
        ParseError,
        `no case matched:
  not in range [1, 3]
  no case matched:
    doesn't match 'undefined'
    not in range [4, 5]
`,
      );
    });
  });

  describe("taggedUnion", () => {
    it("throws an exception when no cases are given", () => {
      assertThrows(
        () => dom.taggedUnion("tag", []),
        Error,
        "taggedUnion requires at least one case",
      );
    });

    it("throws an exception when a case don't have the tag property", () => {
      const cases = [
        dom.object({ "a": dom.of(1) }),
      ];
      assertThrows(
        () => dom.taggedUnion("missing", cases),
        Error,
        "case 'record' doesn't have a 'missing' property",
      );
    });

    const colors = dom.taggedUnion("color", [
      dom.object({ "color": dom.of("red") }),
      dom.object({ "color": dom.of("green") }),
    ]);

    it("chooses the first case with the matching tag", () => {
      assertRoundTrip(colors, { "color": "red" });
      assertRoundTrip(colors, { "color": "green" });
    });

    it("reports an error for a non-record value", () => {
      assertThrows(
        () => colors.parse("red"),
        ParseError,
        `not an object\n\n"red"`,
      );
    });

    it("reports an error when the tag isn't a string", () => {
      assertThrows(
        () => colors.parse({ "color": 123 }),
        ParseError,
        `'color' property is not a string\n\n{ color: 123 }`,
      );
    });

    it("reports an error when no case has a matching tag", () => {
      assertThrows(
        () => colors.parse({ "color": "blue" }),
        ParseError,
        `color: \"blue\" didn't match any case in 'taggedUnion'`,
      );
    });

    it("reports an error when the case with the matching tag doesn't match the value", () => {
      const tagged = dom.taggedUnion("color", [
        dom.object({ "color": dom.of("red"), "count": dom.of(123) }),
        dom.object({ "color": dom.of("yellow"), "count": dom.of(456) }),
      ]);
      assertThrows(
        () => tagged.parse({ "color": "red", "count": "tomato" }),
        ParseError,
        `count: doesn't match '123 (constant)'`,
      );
    });
  });
});
