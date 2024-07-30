import { describe, it } from "@std/testing/bdd";

import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { Pruned } from "../src/backtracking.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import * as dom from "../src/domains.ts";

import { Jar } from "../src/jar_class.ts";

describe("Jar", () => {
  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const remaining = new Jar(dom.of("hi"));
      assertFalse(remaining.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const remaining = new Jar(dom.of("hi"));
      Arbitrary.runWithPicks([], (p) => remaining.pickUnused(p));
      assert(remaining.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const remaining = new Jar(dom.of(false, true));
      Arbitrary.runWithPicks([], (p) => remaining.pickUnused(p));
      assertFalse(remaining.isEmpty());
      Arbitrary.runWithPicks([1], (p) => remaining.pickUnused(p));
      assert(remaining.isEmpty());
    });
  });
  describe("pickUnused", () => {
    it("returns the only value from a constant", () => {
      const remaining = new Jar(dom.of("hi"));
      const gen = Arbitrary.runWithPicks([], (p) => remaining.pickUnused(p));
      assertEquals(gen?.val, "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      const remaining = new Jar(dom.of("hi"));
      assertEquals(
        Arbitrary.runWithPicks([], (p) => remaining.pickUnused(p)).val,
        "hi",
      );
      assertThrows(
        () => Arbitrary.runWithPicks([], (p) => remaining.pickUnused(p)),
        Pruned,
      );
    });
  });
});
