import type { Backtracker } from "../src/backtracking.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import { Jar } from "@/core.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { Filtered } from "../src/pickable.ts";
import { makePickFunction, usePicker } from "../src/build.ts";
import { alwaysPickMin } from "../src/picks.ts";
import { orderedPlayouts } from "../src/ordered.ts";
import { randomPlayouts } from "../src/random.ts";
import { RowJar, UnionJar } from "../src/jars.ts";

describe("Jar", () => {
  const overlap = dom.firstOf(dom.of(1, 2), dom.of(2, 3));

  function checkPicksFromOverlap(stream: Backtracker) {
    const pick = makePickFunction(stream);

    let jar = new Jar(overlap);
    while (stream.startAt(0)) {
      try {
        jar = new Jar(overlap);
        const seen = new Set<number>();
        for (let i = 0; i < 3; i++) {
          assertFalse(jar.isEmpty(), `should not be empty after ${i} picks`);
          const val = jar.takeAny(pick);
          assertFalse(seen.has(val));
          seen.add(val);
        }
        break;
      } catch (e) {
        if (!(e instanceof Filtered)) {
          throw e;
        }
      }
    }

    assert(jar.isEmpty(), "should be empty");
  }

  describe("takeAny", () => {
    it("takes values given a minimum playout", () => {
      const jar = new Jar(dom.int32());
      const pick = usePicker(alwaysPickMin);
      assertEquals(jar.takeAny(pick), 0);
      assertEquals(jar.takeAny(pick), 1);
      assertEquals(jar.takeAny(pick), 2);
      assertEquals(jar.takeAny(pick), 3);
    });

    describe("with an overlapping firstOf", () => {
      it("picks values in order", () => {
        checkPicksFromOverlap(orderedPlayouts());
      });
      it("picks values randomly", () => {
        repeatTest(arb.int32(), (seed) => {
          checkPicksFromOverlap(randomPlayouts(seed));
        });
      });
    });
  });
});

describe("UnionJar", () => {
  const empty = new UnionJar(dom.of(1), []);

  describe("isEmpty", () => {
    it("returns true for an empty jar", () => {
      assert(empty.isEmpty());
    });

    it("returns false for a non-empty jar", () => {
      const jar = new UnionJar(dom.of(1), [dom.of(1)]);
      assertFalse(jar.isEmpty());
    });
  });

  describe("take", () => {
    it("returns false for an empty jar", () => {
      assertEquals(empty.take(1), false);
    });

    it("removes multiple values from the same case", () => {
      const jar = new UnionJar(dom.int(1, 10), [dom.of(1, 2)]);
      assertEquals(jar.take(1), true);
      assertEquals(jar.take(2), true);
      assert(jar.isEmpty());
    });

    it("removes values from different cases", () => {
      const jar = new UnionJar(dom.int(1, 10), [
        dom.of(1),
        dom.of(2),
        dom.of(3),
      ]);
      assertEquals(jar.take(1), true);
      assertEquals(jar.take(2), true);
      assertEquals(jar.take(3), true);
      assert(jar.isEmpty());
    });

    it("doesn't remove the same value twice for overlapping cases", () => {
      const jar = new UnionJar(dom.int(1, 10), [
        dom.of(1, 2),
        dom.of(2, 3),
      ]);
      assertEquals(jar.take(1), true);
      assertEquals(jar.take(2), true);
      assertEquals(jar.take(2), false);
      assertEquals(jar.take(3), true);
      assert(jar.isEmpty());
    });
  });
});

describe("RowJar", () => {
  describe("constructor", () => {
    it("throws if there are no cases", () => {
      assertThrows(
        () => new RowJar([], {}),
        Error,
        "must have at least one case",
      );
    });
  });
});
