import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  fail,
} from "@std/assert";

import { alwaysPick, alwaysPickMin, PickRequest } from "../src/picks.ts";
import { randomPicker } from "../src/random.ts";

import * as arb from "../src/arbitraries/basics.ts";
import { repeatTest } from "../src/runner.ts";

import { PlayoutSearch } from "../src/searches.ts";

const bit = new PickRequest(0, 1);

describe("PlayoutSearch", () => {
  let search = new PlayoutSearch();

  beforeEach(() => {
    search = new PlayoutSearch();
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
      assert(pick.ok);
      assertEquals(pick.val, 0);
      assertEquals(search.depth, 1);
      assertEquals(search.getRequests(), [bit]);
      assertEquals(search.getReplies(), [0]);
      assert(search.endPlayout());
      assertFalse(search.tree.available([pick.val]));
    });

    it("prunes a pick in a wide node", () => {
      assert(search.startAt(0));
      const uint32 = new PickRequest(0, 2 ** 32 - 1);
      const pick = search.nextPick(uint32);
      assert(pick.ok);
      assertEquals(pick.val, 0);
      assert(search.endPlayout());
      assertFalse(search.tree.available([pick.val]), "not pruned");
    });

    it("requires the same range as last time", () => {
      assert(search.startAt(0));
      assertEquals(search.nextPick(bit), { ok: true, val: 0 });
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
          assert(pick.ok);
          if (pick.val == 1) {
            search.nextPick(new PickRequest(1, 2 ** 40));
            counts.other++;
          } else {
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
    let search = new PlayoutSearch();

    beforeEach(() => {
      search = new PlayoutSearch();
    });

    it("disallows calling getRequests() afterwards", () => {
      assert(search.startAt(0));
      assert(search.nextPick(bit).ok);
      assert(search.nextPick(new PickRequest(0, 0)).ok);
      assertEquals(search.getReplies(), [0, 0]);
      assert(search.endPlayout());
      assertThrows(() => search.getRequests(), Error);
    });
  });

  describe("startAt", () => {
    let search = new PlayoutSearch();

    beforeEach(() => {
      search = new PlayoutSearch();
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
      assertEquals(search.nextPick(bit), { ok: true, val: 1 });
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

      assertEquals(search.nextPick(bit), { ok: true, val: 1 });
      assertFalse(
        search.startAt(1),
        "should fail because picks are exhausted",
      );
      assert(search.startAt(0));
    });
  });

  describe("getReplies", () => {
    it("returns all the picks when called with no arguments", () => {
      const search = new PlayoutSearch();
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
      const search = new PlayoutSearch();
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        assert(search.startAt(0));
        const picks: number[] = [];
        for (let j = 0; j < 3; j++) {
          const pick = search.nextPick(digit);
          assert(pick.ok);
          picks.push(pick.val);
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
});
