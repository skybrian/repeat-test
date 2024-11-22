import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";
import { scriptFromCases } from "../../src/scripts/scriptFromCases.ts";
import { assertSometimes } from "../lib/asserts.ts";
import { scriptOf } from "../../src/scripts/scriptOf.ts";

describe("scriptFromCases", () => {
  it("throws if given zero cases", () => {
    assertThrows(() => scriptFromCases([]));
  });

  it("chooses evenly between two cases", () => {
    const ab = scriptFromCases([
      scriptOf(["a"]),
      scriptOf(["b"]),
    ]);
    assertSometimes(ab, (v) => v === "a", 45, 55);
  });
});
