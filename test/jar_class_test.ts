import { describe, it } from "@std/testing/bdd";

import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { Pruned } from "../src/backtracking.ts";
import * as dom from "../src/domains.ts";

import { Jar } from "../src/jar_class.ts";

describe("Jar", () => {
  describe("take", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.take([0]), "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      const jar = new Jar(dom.of("hi"));
      jar.take([0]);
      assertThrows(() => jar.take([0]), Pruned);
    });
    it("picks values from an overlapping oneOf", () => {
      const overlap = dom.oneOf([dom.of(1, 2), dom.of(2, 3)]);
      const jar = new Jar(overlap);
      assertEquals(jar.take([0, 0]), 1);
      assertEquals(jar.take([0, 1]), 2);
      assertThrows(() => jar.take([1, 0]), Pruned); // not canonical
      assertEquals(jar.take([1, 1]), 3);
      assert(jar.isEmpty());
    });
  });
  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const jar = new Jar(dom.of("hi"));
      assertFalse(jar.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      jar.take([0]);
      assert(jar.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const jar = new Jar(dom.of(false, true));
      jar.take([0]);
      assertFalse(jar.isEmpty());
      jar.take([1]);
      assert(jar.isEmpty());
    });
  });
  describe("takeAll", () => {
    it("returns the only value from a constant", () => {
      assertEquals(Jar.takeAll(dom.of("hi")), ["hi"]);
    });
    it("removes duplicates in an overlapping oneOf", () => {
      const overlap = dom.oneOf([dom.of(1, 2), dom.of(2, 3)]);
      const vals = Jar.takeAll(overlap);
      vals.sort();
      assertEquals(vals, [1, 2, 3]);
    });
  });
});
