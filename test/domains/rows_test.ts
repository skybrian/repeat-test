import type { RowShape } from "@/domain.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as dom from "@/doms.ts";

import { assertEncoding, assertRoundTrip } from "../lib/asserts.ts";
import { ParseError } from "@/domain.ts";

describe("object", () => {
  describe("constructor", () => {
    it("throws errors for bad arguments", () => {
      assertThrows(
        () => dom.object(undefined as unknown as RowShape<unknown>),
        Error,
      );

      assertThrows(
        () => dom.object({ a: "b" } as RowShape<unknown>),
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
      const nested = dom.object({ nest: justA });

      it("accepts an object with the same properties", () => {
        assertEquals(justA.parse({ a: 0 }), { a: 0 });
      });

      it("rejects an object with extra properties", () => {
        assertThrows(
          () => justA.parse({ a: 0, b: "extra" }),
          Error,
          "extra property: b",
        );
        assertThrows(
          () => nested.parse({ nest: { a: 0, b: "extra" } }),
          Error,
          "nest: extra property: b",
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

describe("taggedUnion", () => {
  it("throws an exception when no cases are given", () => {
    assertThrows(
      () => dom.taggedUnion("tag", []),
      Error,
      "taggedUnion requires at least one case",
    );
  });

  it("throws an exception when a case doesn't have the tag property", () => {
    const cases = [
      dom.object({ "a": dom.of(1) }),
    ];
    assertThrows(
      () => dom.taggedUnion("missing" as unknown as "a", cases),
      Error,
      "case 0 doesn't have a 'missing' property",
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

  it("reports an error for a non-object", () => {
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
