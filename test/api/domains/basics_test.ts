import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import * as dom from "@skybrian/repeat-test/doms";
import { Domain, ParseError } from "@skybrian/repeat-test/core";
import { repeatTest } from "@skybrian/repeat-test/runner";
import { assertRoundTrip, assertThrows } from "../support/asserts.ts";
import { intRange, invalidIntRange, minMaxVal } from "../support/ranges.ts";

describe("of", () => {
  describe("for a single-item domain", () => {
    const one = dom.of(1);
    it("accepts a constant value", () => assertRoundTrip(one, 1));
    it("rejects items not passed in as arguments", () => {
      assertThrows(
        () => one.parse(2),
        ParseError,
        "doesn't match '1 (constant)'",
      );
    });
  });

  it("rejects items not passed in as arguments", () => {
    assertThrows(
      () => dom.of(1, 2, 3).parse(4),
      ParseError,
      "not a member of '3 examples': 4",
    );
  });
  it("uses a name added later in error messages", () => {
    assertThrows(
      () => dom.of(1, 2, 3).with({ name: "digit" }).parse(4),
      ParseError,
      "not a member of 'digit': 4",
    );
  });
  it("automatically names simple constants", () => {
    deepStrictEqual(dom.of(undefined).name, "undefined (constant)");
    deepStrictEqual(dom.of(1).name, "1 (constant)");
    deepStrictEqual(dom.of("hello").name, `"hello" (constant)`);
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
    assertRoundTrip(child, {
      left: { left: "a", right: "b" },
      right: { left: "c", right: "d" },
    });
  });
});

describe("boolean", () => {
  it("rejects non-booleans", () => {
    assertThrows(
      () => dom.boolean().parse(undefined),
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
    repeatTest(
      minMaxVal(),
      ({ min, max, val }) => assertRoundTrip(dom.int(min, max), val),
    );
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
      deepStrictEqual(dom.int(min, max).parse(val), val);
    });
  });
});

describe("array", () => {
  describe("for a variable-length array", () => {
    const arr = dom.array(dom.int(1, 3));
    it("rejects non-arrays", () => {
      assertThrows(() => arr.parse(undefined), ParseError, "not an array");
      assertThrows(() => arr.parse(0), ParseError, "not an array");
    });
    it("rejects arrays with an invalid item", () => {
      assertThrows(() => arr.parse([1, 0]), ParseError, "1: not in range");
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
  });
  describe("with a fixed-length array", () => {
    const arr = dom.array(dom.int(1, 3), { length: 2 });
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
    it("rejects values that don't match", () => {
      assertThrows(
        () => dom.firstOf(dom.int(1, 3)).parse(0),
        ParseError,
        "not in range",
      );
    });
  });
  describe("for multiple cases", () => {
    const multiWay = dom.firstOf(dom.int(1, 3), dom.int(4, 6));
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
    it("reports its own name in errors if it's not untitled", () => {
      const named = multiWay.with({ name: "named" });
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
});

describe("for a nested firstOf", () => {
  const undef = dom.of(undefined).with({ name: "undefined" });
  const nested = dom.firstOf(dom.int(1, 3), dom.firstOf(undef, dom.int(4, 5)));
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
