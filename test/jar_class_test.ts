import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as dom from "../src/domains.ts";

import { Pruned } from "../src/backtracking.ts";
import { makePickFunction } from "../src/pick_function.ts";
import { PlayoutSearch } from "../src/searches.ts";

import { Jar } from "../src/jar_class.ts";
import { repeatTest } from "../src/runner.ts";
import { arb } from "../main.ts";
import { randomPicker } from "../src/random.ts";

describe("Jar", () => {
  let search = new PlayoutSearch();
  let pick = makePickFunction(search);

  beforeEach(() => {
    search = new PlayoutSearch();
    pick = makePickFunction(search);
    assert(search.startAt(0));
  });

  describe("take", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.take(pick), "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      const jar = new Jar(dom.of("hi"));
      jar.take(pick);
      assertThrows(() => jar.take(pick), Pruned);
    });
    it("picks values from an overlapping oneOf", () => {
      const overlap = dom.oneOf([dom.of(1, 2), dom.of(2, 3)]);
      repeatTest(arb.int32(), (seed) => {
        search = new PlayoutSearch();
        search.pickSource = randomPicker(seed);
        pick = makePickFunction(search);
        assert(search.startAt(0));

        const jar = new Jar(overlap);
        const seen = new Set<number>();
        for (let i = 0; i < 3; i++) {
          assertFalse(jar.isEmpty());
          const val = jar.take(pick);
          assertFalse(seen.has(val));
          seen.add(val);
        }
        assert(jar.isEmpty(), "should be empty");
      });
    });
  });
  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const jar = new Jar(dom.of("hi"));
      assertFalse(jar.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      jar.take(pick);
      assert(jar.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const jar = new Jar(dom.of(false, true));
      jar.take(pick);
      assertFalse(jar.isEmpty());
      jar.take(pick);
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
