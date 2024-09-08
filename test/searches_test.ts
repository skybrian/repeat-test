import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  fail,
} from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";

import { alwaysPick, alwaysPickMin, PickRequest } from "../src/picks.ts";
import { randomPicker } from "../src/random.ts";
import { PartialTracker } from "../src/searches.ts";
import { generate } from "../src/generated.ts";

const bit = new PickRequest(0, 1);

describe("PartialTracker", () => {
  let search = new PartialTracker();

  beforeEach(() => {
    search = new PartialTracker();
  });

  describe("constructor", () => {
    it("starts with default settings", () => {
      assertEquals(search.depth, 0);
      assertFalse(search.done);
    });
  });
  describe("nextPick", () => {
    it("picks the minimum value by default", () => {
      assert(search.startAt(0));
      const pick = search.nextPick(bit);
      assertEquals(pick, 0);
      assertEquals(search.depth, 1);
      assertEquals(search.getRequests(), [bit]);
      assertEquals(search.getReplies(), [0]);
      assert(search.endPlayout());
      assert(pick !== undefined);
      assertFalse(search.tree.available([pick]));
    });

    it("prunes a pick in a wide node", () => {
      assert(search.startAt(0));
      const uint32 = new PickRequest(0, 2 ** 32 - 1);
      const pick = search.nextPick(uint32);
      assertEquals(pick, 0);
      assert(search.endPlayout());
      assert(pick !== undefined);
      assertFalse(search.tree.available([pick]), "not pruned");
    });

    it("requires the same range as last time", () => {
      assert(search.startAt(0));
      assertEquals(search.nextPick(bit), 0);
      search.startAt(0);
      assertThrows(() => search.nextPick(new PickRequest(-1, 0)), Error);
    });

    describe("when using a random underlying picker", () => {
      beforeEach(() => {
        search.pickSource = randomPicker(123);
      });

      it("doesn't revisit a constant in an unbalanced tree", () => {
        const counts = {
          constants: 0,
          other: 0,
        };
        for (let i = 0; i < 1000; i++) {
          assert(search.startAt(0));
          const pick = search.nextPick(bit);
          if (pick === 1) {
            search.nextPick(new PickRequest(1, 2 ** 40));
            counts.other++;
          } else {
            assert(pick === 0);
            search.nextPick(new PickRequest(1, 2));
            counts.constants++;
          }
        }

        assertEquals(counts, {
          constants: 2,
          other: 998,
        });
      });
    });
  });

  describe("finishPlayout", () => {
    let search = new PartialTracker();

    beforeEach(() => {
      search = new PartialTracker();
    });

    it("disallows calling getRequests() afterwards", () => {
      assert(search.startAt(0));
      assertEquals(search.nextPick(bit), 0);
      assertEquals(search.nextPick(new PickRequest(0, 0)), 0);
      assertEquals(search.getReplies(), [0, 0]);
      assert(search.endPlayout());
      assertThrows(() => search.getRequests(), Error);
    });
  });

  describe("startAt", () => {
    let search = new PartialTracker();

    beforeEach(() => {
      search = new PartialTracker();
    });

    it("ends the search if no root was created (for a constant)", () => {
      assert(search.startAt(0));
      assertFalse(search.startAt(0), "Shouldn't be more playouts");
    });

    it("ends the search when the root has no other children", () => {
      assert(search.startAt(0));
      search.nextPick(new PickRequest(0, 1));
      assert(search.startAt(0));
      search.nextPick(new PickRequest(0, 1));
      assertFalse(search.startAt(0));
    });

    it("starts a new playout when there's a fork", () => {
      assert(search.startAt(0));
      search.nextPick(bit);
      assert(search.startAt(0));
      assertEquals(search.depth, 0);
      assertEquals(search.getRequests(), []);
      assertEquals(search.getReplies(), []);
    });

    it("goes to a different child after a fork", () => {
      assert(search.startAt(0));
      search.nextPick(bit);
      search.startAt(0);
      assertEquals(search.nextPick(bit), 1);
    });

    it("ends the search when both sides of a fork were visited", () => {
      assert(search.startAt(0));
      search.nextPick(bit);
      search.startAt(0);
      search.nextPick(bit);
      assertFalse(search.startAt(0));
    });

    it("goes back to a non-zero level", () => {
      assert(search.startAt(0));
      search.nextPick(bit);
      search.nextPick(bit);
      search.startAt(1);
      assertEquals(search.depth, 1);
    });

    it("goes to a different child after going back to a non-zero level", () => {
      assert(search.startAt(0));
      search.nextPick(bit);
      search.nextPick(bit);
      assert(search.startAt(1));

      assertEquals(search.nextPick(bit), 1);
      assertFalse(
        search.startAt(1),
        "should fail because picks are exhausted",
      );
      assert(search.startAt(0));
    });
  });

  describe("getReplies", () => {
    it("returns all the picks when called with no arguments", () => {
      const search = new PartialTracker();
      assert(search.startAt(0));
      search.nextPick(bit);
      assertEquals(search.getReplies(), [0]);
    });
  });

  it("fully explores a combination lock", () => {
    const underlyingPickers = arb.oneOf(
      arb.of(
        alwaysPickMin,
        alwaysPick(3),
      ),
      arb.int(-(2 ** 32), (2 ** 32) - 1).map((seed) => randomPicker(seed)),
    );
    const digit = new PickRequest(0, 9);

    repeatTest(underlyingPickers, (underlying) => {
      const search = new PartialTracker();
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        assert(search.startAt(0));
        const picks: number[] = [];
        for (let j = 0; j < 3; j++) {
          const pick = search.nextPick(digit);
          assert(pick !== undefined);
          picks.push(pick);
        }
        assert(search.endPlayout());
        assertFalse(search.tree.available(picks));
        const key = JSON.stringify(picks);
        if (seen.has(key)) {
          fail(`duplicate picks: ${key}`);
        }
        seen.add(key);
      }
      assertFalse(search.startAt(0));

      const playouts = Array.from(seen.values());
      assertEquals(playouts.length, 1000);
      if (underlying === alwaysPickMin) {
        assertEquals(playouts[0], "[0,0,0]");
        assertEquals(playouts[999], "[9,9,9]");
      }
    }, { reps: 100 });
  });

  it("doesn't generate duplicate small strings", () => {
    search.pickSource = randomPicker(123);
    const str = arb.string();
    const seen = new Set<string>();
    for (let i = 0; i < 100000; i++) {
      const gen = generate(str, search);
      assert(gen !== undefined);
      const s = gen.val;
      if (s.length <= 1) {
        assert(!seen.has(s), `duplicate string: ${s}`);
        seen.add(s);
      }
    }
  });
});
