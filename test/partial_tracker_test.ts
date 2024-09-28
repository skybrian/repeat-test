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
import { randomPicker, randomPlayouts } from "../src/random.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { generate } from "../src/generated.ts";
import { PlayoutSource } from "../src/backtracking.ts";

const bit = new PickRequest(0, 1);

describe("PartialTracker", () => {
  let tracker = new PartialTracker(alwaysPickMin);
  let stream = new PlayoutSource(tracker);

  beforeEach(() => {
    tracker = new PartialTracker(alwaysPickMin);
    stream = new PlayoutSource(tracker);
  });

  describe("constructor", () => {
    it("starts with default settings", () => {
      assertEquals(stream.depth, 0);
      assertFalse(stream.done);
    });
  });

  describe("nextPick", () => {
    it("picks the minimum value by default", () => {
      assert(stream.startAt(0));
      const pick = stream.nextPick(bit);
      assertEquals(pick, 0);
      assertEquals(stream.depth, 1);
      assertEquals(stream.getRequests(), [bit]);
      assertEquals(stream.getReplies(), [0]);
      stream.endPlayout();
      assert(pick !== undefined);
      assertFalse(tracker.tree.available([pick]));
    });

    it("prunes a pick in a wide node", () => {
      assert(stream.startAt(0));
      const uint32 = new PickRequest(0, 2 ** 32 - 1);
      const pick = stream.nextPick(uint32);
      assertEquals(pick, 0);
      stream.endPlayout();
      assert(pick !== undefined);
      assertFalse(tracker.tree.available([pick]), "not pruned");
    });

    it("requires the same range as last time", () => {
      assert(stream.startAt(0));
      assertEquals(stream.nextPick(bit), 0);
      stream.startAt(0);
      assertThrows(() => stream.nextPick(new PickRequest(-1, 0)), Error);
    });

    describe("when using a random underlying picker", () => {
      beforeEach(() => {
        stream = randomPlayouts(123);
      });

      it("doesn't revisit a constant in an unbalanced tree", () => {
        const counts = {
          constants: 0,
          other: 0,
        };
        for (let i = 0; i < 1000; i++) {
          assert(stream.startAt(0));
          const pick = stream.nextPick(bit);
          if (pick === 1) {
            stream.nextPick(new PickRequest(1, 2 ** 40));
            counts.other++;
          } else {
            assert(pick === 0);
            stream.nextPick(new PickRequest(1, 2));
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

  describe("endPlayout", () => {
    it("disallows calling getRequests() afterwards", () => {
      assert(stream.startAt(0));
      assertEquals(stream.nextPick(bit), 0);
      assertEquals(stream.nextPick(new PickRequest(0, 0)), 0);
      assertEquals(stream.getReplies(), [0, 0]);
      stream.endPlayout();
      assertThrows(() => stream.getRequests(), Error);
    });
  });

  describe("startAt", () => {
    it("ends the search if no root was created (for a constant)", () => {
      assert(stream.startAt(0));
      assertFalse(stream.startAt(0), "Shouldn't be more playouts");
    });

    it("ends the search when the root has no other children", () => {
      assert(stream.startAt(0));
      stream.nextPick(new PickRequest(0, 1));
      assert(stream.startAt(0));
      stream.nextPick(new PickRequest(0, 1));
      assertFalse(stream.startAt(0));
    });

    it("starts a new playout when there's a fork", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      assert(stream.startAt(0));
      assertEquals(stream.depth, 0);
      assertEquals(stream.getRequests(), []);
      assertEquals(stream.getReplies(), []);
    });

    it("goes to a different child after a fork", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      stream.startAt(0);
      assertEquals(stream.nextPick(bit), 1);
    });

    it("ends the search when both sides of a fork were visited", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      stream.startAt(0);
      stream.nextPick(bit);
      assertFalse(stream.startAt(0));
    });

    it("goes back to a non-zero level", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      stream.nextPick(bit);
      stream.startAt(1);
      assertEquals(stream.depth, 1);
    });

    it("goes to a different child after going back to a non-zero level", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      stream.nextPick(bit);
      assert(stream.startAt(1));

      assertEquals(stream.nextPick(bit), 1);
      assertFalse(
        stream.startAt(1),
        "should fail because picks are exhausted",
      );
      assert(stream.startAt(0));
    });
  });

  describe("getReplies", () => {
    it("returns all the picks when called with no arguments", () => {
      assert(stream.startAt(0));
      stream.nextPick(bit);
      assertEquals(stream.getReplies(), [0]);
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
      const tracker = new PartialTracker(underlying);
      const stream = new PlayoutSource(tracker);
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        assert(stream.startAt(0));
        const picks: number[] = [];
        for (let j = 0; j < 3; j++) {
          const pick = stream.nextPick(digit);
          assert(pick !== undefined);
          picks.push(pick);
        }
        stream.endPlayout();
        assertFalse(tracker.tree.available(picks));
        const key = JSON.stringify(picks);
        if (seen.has(key)) {
          fail(`duplicate picks: ${key}`);
        }
        seen.add(key);
      }
      assertFalse(stream.startAt(0));

      const playouts = Array.from(seen.values());
      assertEquals(playouts.length, 1000);
      if (underlying === alwaysPickMin) {
        assertEquals(playouts[0], "[0,0,0]");
        assertEquals(playouts[999], "[9,9,9]");
      }
    }, { reps: 100 });
  });

  it("doesn't generate duplicate small strings", () => {
    tracker.pickSource = randomPicker(123);
    const str = arb.string({ length: { max: 10 } });
    const seen = new Set<string>();
    for (let i = 0; i < 100000; i++) {
      const gen = generate(str, stream);
      assert(gen !== undefined);
      const s = gen.val;
      if (s.length <= 1) {
        assert(!seen.has(s), `duplicate string: ${s}`);
        seen.add(s);
      }
    }
  });
});
