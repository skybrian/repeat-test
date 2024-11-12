import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertGenerated } from "../lib/asserts.ts";
import { scriptOf } from "../../src/scripts/scriptOf.ts";

describe("chooseFrom", () => {
  it("throws if called with no arguments", () => {
    assertThrows(
      () => scriptOf([]),
      Error,
      "itemFrom() requires at least one item",
    );
  });

  it("throws if passed a non-frozen object", () => {
    assertThrows(
      () => scriptOf([{}]),
      Error,
      "itemFrom() requires frozen objects",
    );
  });

  it("returns a constant Script if called with one argument", () => {
    const script = scriptOf(["hi"]);
    assertGenerated(script, [{ val: "hi", picks: [] }]);
    assertEquals(script.opts.maxSize, 1);
  });

  it("creates an Arbitrary with multiple arguments", () => {
    const script = scriptOf(["hi", "there"]);
    assertGenerated(script, [
      { val: "hi", picks: [0] },
      { val: "there", picks: [1] },
    ]);
    assertEquals(script.opts.maxSize, 2);
  });
});
