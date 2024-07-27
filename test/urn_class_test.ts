import { describe, it } from "@std/testing/bdd";
import { Jar } from "../src/urn_class.ts";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import Arbitrary from "../src/arbitrary_class.ts";
import { Pruned } from "../src/backtracking.ts";

describe("Jar", () => {
  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const urn = new Jar(Arbitrary.of("hi"));
      assertFalse(urn.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const jar = new Jar(Arbitrary.of("hi"));
      Arbitrary.runCallback((p) => jar.pickUnused(p), [0]);
      assert(jar.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const jar = new Jar(Arbitrary.of(false, true));
      Arbitrary.runCallback((p) => jar.pickUnused(p), [0]);
      assertFalse(jar.isEmpty());
      Arbitrary.runCallback((p) => jar.pickUnused(p), [1]);
      assert(jar.isEmpty());
    });
  });
  describe("pickUnused", () => {
    const jar = new Jar(Arbitrary.of("hi"));
    it("returns the only value from a constant", () => {
      const gen = Arbitrary.runCallback((p) => jar.pickUnused(p), [0]);
      assertEquals(gen?.val, "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      assertThrows(
        () => Arbitrary.runCallback((p) => jar.pickUnused(p), [0]),
        Pruned,
      );
    });
  });
});
