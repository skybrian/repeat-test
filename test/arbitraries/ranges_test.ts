import { assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { intRange } from "../../src/arbitraries/ranges.ts";

describe("intRange", () => {
  it("throws if minSize is < 1", () => {
    assertThrows(
      () => intRange({ minSize: 0 }),
      Error,
      "minSize must be >= 1",
    );
  });
  it("throws if maxSize is < minSize", () => {
    assertThrows(
      () => intRange({ minSize: 10, maxSize: 9 }),
      Error,
      "maxSize must be >= minSize",
    );
  });
});
