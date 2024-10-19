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

describe("Jar", () => {
  let pick = makePickFunction(depthFirstPlayouts());

  beforeEach(() => {
    const stream = depthFirstPlayouts();
    pick = makePickFunction(stream);
    assert(stream.startAt(0));
  });

  const overlap = dom.oneOf(dom.of(1, 2), dom.of(2, 3));

  function checkPicksFromOverlap(stream: Backtracker) {
    pick = makePickFunction(stream);

    let jar = new Jar(overlap);
    while (stream.startAt(0)) {
      try {
        jar = new Jar(overlap);
        const seen = new Set<number>();
        for (let i = 0; i < 3; i++) {
          assertFalse(jar.isEmpty(), `should not be empty after ${i} picks`);
          const val = jar.take(pick);
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

  describe("take", () => {
    it("returns the only value from a constant", () => {
      const jar = new Jar(dom.of("hi"));
      assertEquals(jar.take(pick), "hi");
    });
    it("throws Pruned if the same playout was seen twice", () => {
      const jar = new Jar(dom.of("hi"));
      jar.take(pick);
      assertThrows(() => jar.take(pick), Filtered);
    });

    describe("with an overlapping oneOf", () => {
      it("picks values in order", () => {
        checkPicksFromOverlap(orderedPlayouts());
      });
      it("picks values randomly", () => {
        repeatTest(arb.int32(), (seed) => {
          checkPicksFromOverlap(randomPlayouts(seed));
        });
      });
    });

    it("takes values given a minimum playout", () => {
      const jar = new Jar(dom.int32());
      const pick = usePicker(alwaysPickMin);
      assertEquals(jar.take(pick), 0);
      assertEquals(jar.take(pick), 1);
      assertEquals(jar.take(pick), 2);
      assertEquals(jar.take(pick), 3);
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
});
