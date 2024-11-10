import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertGenerated } from "../lib/asserts.ts";
import { chooseFrom } from "../../src/scripts/chooseFrom.ts";

describe("chooseFrom", () => {
  it("throws if called with no arguments", () => {
    assertThrows(
      () => chooseFrom([]),
      Error,
      "itemFrom() requires at least one item",
    );
  });

  it("throws if passed a non-frozen object", () => {
    assertThrows(
      () => chooseFrom([{}]),
      Error,
      "itemFrom() requires frozen objects",
    );
  });

  it("returns a constant Script if called with one argument", () => {
    const script = chooseFrom(["hi"]);
    assertGenerated(script, [{ val: "hi", picks: [] }]);
    assertEquals(script.opts.maxSize, 1);
  });

  it("creates an Arbitrary with multiple arguments", () => {
    const script = chooseFrom(["hi", "there"]);
    assertGenerated(script, [
      { val: "hi", picks: [0] },
      { val: "there", picks: [1] },
    ]);
    assertEquals(script.opts.maxSize, 2);
  });
});
