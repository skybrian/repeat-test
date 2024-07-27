import { describe, it } from "@std/testing/bdd";
import { Jar } from "../src/jar_class.ts";
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
      Arbitrary.runWithPicks([], (p) => jar.pickUnused(p));
      assert(jar.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const jar = new Jar(Arbitrary.of(false, true));
      Arbitrary.runWithPicks([], (p) => jar.pickUnused(p));
      assertFalse(jar.isEmpty());
      Arbitrary.runWithPicks([1], (p) => jar.pickUnused(p));
      assert(jar.isEmpty());
    });
  });
  describe("pickUnused", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(Arbitrary.of("hi"));
      const gen = Arbitrary.runWithPicks([], (p) => jar.pickUnused(p));
      assertEquals(gen?.val, "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      const jar = new Jar(Arbitrary.of("hi"));
      assertEquals(
        Arbitrary.runWithPicks([], (p) => jar.pickUnused(p)).val,
        "hi",
      );
      assertThrows(
        () => Arbitrary.runWithPicks([], (p) => jar.pickUnused(p)),
        Pruned,
      );
    });
  });
});
