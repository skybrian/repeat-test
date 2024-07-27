import { describe, it } from "@std/testing/bdd";
import { Urn } from "../src/urn_class.ts";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import Arbitrary from "../src/arbitrary_class.ts";
import { Pruned } from "../src/backtracking.ts";

describe("Urn", () => {
  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const urn = new Urn(Arbitrary.of("hi"));
      assertFalse(urn.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const urn = new Urn(Arbitrary.of("hi"));
      Arbitrary.runCallback((p) => urn.takeOne(p), [0]);
      assert(urn.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const urn = new Urn(Arbitrary.of(false, true));
      Arbitrary.runCallback((p) => urn.takeOne(p), [0]);
      assertFalse(urn.isEmpty());
      Arbitrary.runCallback((p) => urn.takeOne(p), [1]);
      assert(urn.isEmpty());
    });
  });
  describe("takeOne", () => {
    const urn = new Urn(Arbitrary.of("hi"));
    it("returns the only value from a constant", () => {
      const gen = Arbitrary.runCallback((p) => urn.takeOne(p), [0]);
      assertEquals(gen?.val, "hi");
    });
    it("throws Pruned if the same playout is run twice", () => {
      assertThrows(
        () => Arbitrary.runCallback((p) => urn.takeOne(p), [0]),
        Pruned,
      );
    });
  });
});
