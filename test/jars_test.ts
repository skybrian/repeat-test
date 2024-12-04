import type { Backtracker } from "../src/backtracking.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import { Jar } from "@/domain.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { Filtered } from "../src/pickable.ts";
import { makePickFunction, usePicker } from "../src/build.ts";
import { alwaysPickMin } from "../src/picks.ts";
import { depthFirstPlayouts } from "../src/partial_tracker.ts";
import { orderedPlayouts } from "../src/ordered.ts";
import { randomPlayouts } from "../src/random.ts";
import { RowJar, UnionJar } from "../src/jars.ts";

describe("Jar", () => {
  let pick = makePickFunction(depthFirstPlayouts());

  beforeEach(() => {
    const stream = depthFirstPlayouts();
    pick = makePickFunction(stream);
    assert(stream.startAt(0));
  });

  const overlap = dom.firstOf(dom.of(1, 2), dom.of(2, 3));

  function checkPicksFromOverlap(stream: Backtracker) {
    pick = makePickFunction(stream);

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

  describe("has", () => {
    it("returns true if the value is in the Jar", () => {
      const jar = new Jar(dom.of(1, 2));
      assert(jar.has(1));
      assert(jar.has(2));
    });

    it("returns false if the value is not in the domain", () => {
      const jar = new Jar(dom.of(1, 2));
      assertFalse(jar.has(3));
    });

    it("returns false if the value was removed", () => {
      const jar = new Jar(dom.of(1, 2));
      jar.take(1);
      assertFalse(jar.has(1));
    });
  });

  describe("take", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.take("x"), false);
      assertEquals(jar.take("hi"), true);
      assertEquals(jar.take("hi"), false);
      assert(jar.isEmpty(), "should be empty");
    });
  });

  describe("takeAny", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.takeAny(pick), "hi");
    });

    it("throws Pruned if the same playout was seen twice", () => {
      const jar = new Jar(dom.of("hi"));
      jar.takeAny(pick);
      assertThrows(() => jar.takeAny(pick), Filtered);
    });

    it("takes values given a minimum playout", () => {
      const jar = new Jar(dom.int32());
      const pick = usePicker(alwaysPickMin);
      assertEquals(jar.takeAny(pick), 0);
      assertEquals(jar.takeAny(pick), 1);
      assertEquals(jar.takeAny(pick), 2);
      assertEquals(jar.takeAny(pick), 3);
    });

    it("takes a value when accept returns true", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.takeAny(pick, { accept: () => true }), "hi");
    });

    it("doesn't take a value when accept returns false", () => {
      const jar = new Jar(dom.of("hi", "there"));
      assertEquals(
        jar.takeAny(pick, { accept: (x) => x === "there" }),
        "there",
      );
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

  describe("isEmpty", () => {
    it("returns false when nothing has been taken yet", () => {
      const jar = new Jar(dom.of("hi"));
      assertFalse(jar.isEmpty());
    });
    it("returns true after taking the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      jar.takeAny(pick);
      assert(jar.isEmpty());
    });
    it("returns true after taking both values of a boolean", () => {
      const jar = new Jar(dom.of(false, true));
      jar.takeAny(pick);
      assertFalse(jar.isEmpty());
      jar.takeAny(pick);
      assert(jar.isEmpty());
    });
  });

  describe("removeUntil", () => {
    it("does nothing when the predicate is always true", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      jar.removeUntil(() => true);
      assert(jar.take(1));
      assert(jar.take(2));
      assert(jar.take(3));
      assert(jar.isEmpty());
    });

    it("removes all values when the predicate is always false", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      jar.removeUntil(() => false);
      assert(jar.isEmpty());
    });

    it("removes starting values", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      jar.removeUntil((x) => x > 1);
      assertFalse(jar.isEmpty());
      assertFalse(jar.take(1));
      assert(jar.take(2));
      assert(jar.take(3));
      assert(jar.isEmpty());
    });

    it("doesn't remove ending values", () => {
      const jar = new Jar(dom.of(1, 2, 3));
      jar.removeUntil((x) => x < 3);
      assertFalse(jar.isEmpty());
      assert(jar.take(1));
      assert(jar.take(2));
      assert(jar.take(3));
      assert(jar.isEmpty());
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
