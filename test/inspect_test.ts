import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { inspect } from "../src/inspect.ts";
import { frozen } from "../src/frozen.ts";

describe("inspect", () => {
  it("formats primitive values", () => {
    const cases = frozen(
      [
        [undefined, "undefined"],
        [null, "null"],
        [true, "true"],
        [false, "false"],
        [123, "123"],
        [-0, "-0"],
        [NaN, "NaN"],
        [Infinity, "Infinity"],
        [-Infinity, "-Infinity"],
        [123n, "123n"],
      ] as const,
    );
    for (const [value, expected] of cases) {
      assertEquals(inspect(value), expected);
    }
  });

  it("quotes strings and escapes control characters", () => {
    assertEquals(inspect(""), '""');
    assertEquals(inspect("hello"), '"hello"');
    assertEquals(inspect("line\nbreak\ttab"), '"line\\nbreak\\ttab"');
  });

  it("formats arrays", () => {
    assertEquals(inspect(frozen([1, "two", null])), '[ 1, "two", null ]');
  });

  it("formats nested objects", () => {
    const value = frozen({ a: 123, nested: frozen([true, "hello"]) });
    assertEquals(inspect(value), '{ a: 123, nested: [ true, "hello" ] }');
  });

  it("handles circular references", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    assertEquals(inspect(value), "<ref *1> { self: [Circular *1] }");
  });

  it("does not invoke getters", () => {
    const value = {
      get value() {
        throw new Error("getter called");
      },
    };
    assertEquals(inspect(value), "{ value: [Getter] }");
  });
});
