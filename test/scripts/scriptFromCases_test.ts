import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";
import { scriptFromCases } from "../../src/scripts/scriptFromCases.ts";
import { assertSometimes } from "../lib/asserts.ts";
import { scriptOf } from "../../src/scripts/scriptOf.ts";

describe("scriptFromCases", () => {
  it("throws if given zero cases", () => {
    assertThrows(
      () => scriptFromCases([]),
      Error,
      "scriptFromCases() requires at least one case",
    );
  });

  it("throws if given cases that all have zero weight", () => {
    assertThrows(
      () => scriptFromCases([scriptOf(["a"]).with({ weight: 0 })]),
      Error,
      "scriptFromCases() requires at least one case with weight > 0",
    );
  });

  it("chooses evenly between two cases", () => {
    const ab = scriptFromCases([
      scriptOf(["a"]),
      scriptOf(["b"]),
    ]);
    assertSometimes(ab, (v) => v === "a", 45, 55);
  });

  it("usually chooses the case with more weight", () => {
    const ab = scriptFromCases([
      scriptOf(["a"]).with({ weight: 3 }),
      scriptOf(["b"]),
    ]);
    assertSometimes(ab, (v) => v === "a", 70, 80);
  });
});
