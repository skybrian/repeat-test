import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickList, PickRequest } from "../src/picks.ts";
import { shrink, shrinkLength, shrinkPicksFrom } from "../src/shrink.ts";
import Codec from "../src/codec_class.ts";
import * as codec from "../src/codecs.ts";

function assertShrinks<T>(
  codec: Codec<T>,
  interesting: (arg: T) => boolean,
  start: T,
  result: T,
) {
  const startSol = codec.toSolution(start);
  assert(startSol, "didn't find starting solution");

  const smaller = shrink(codec.domain, interesting, startSol);
  assert(smaller, "didn't find a smaller solution");
  assertEquals(smaller.val, result);
}

function assertNoChange<T>(
  codec: Codec<T>,
  interesting: (arg: T) => boolean,
  start: T,
) {
  assertShrinks(codec, interesting, start, start);
}

describe("shrink", () => {
  describe("for a single pick", () => {
    it("can't shrink the minimum value", () => {
      assertNoChange(codec.int(1, 6), () => true, 1);
    });
    it("can't shrink when there's no alternative", () => {
      repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
        assertNoChange(codec.int(min, max), (n) => n === val, val);
      });
    });
    it("shrinks an int to the minimum", () => {
      assertShrinks(codec.int(1, 6), () => true, 6, 1);
    });
    it("finds a smaller int", () => {
      assertShrinks(codec.int(1, 6), (n) => n >= 3, 6, 3);
    });
  });
  describe("for an ascii character", () => {
    it("can't shrink 'a'", () => {
      assertNoChange(codec.asciiChar(), () => true, "a");
    });
    it("can't shrink when there's no alternative", () => {
      repeatTest(arb.asciiChar(), (start) => {
        assertNoChange(codec.asciiChar(), (c) => c === start, start);
      });
    });
    it("shrinks 'Z' to 'a'", () => {
      assertShrinks(codec.asciiChar(), () => true, "Z", "a");
    });
  });
  describe("for a string", () => {
    it("can't shrink an empty string", () => {
      assertNoChange(codec.anyString(), () => true, "");
    });
    it("can't shrink when there's no alternative", () => {
      repeatTest(arb.anyString(), (start) => {
        assertNoChange(codec.anyString(), (s) => s === start, start);
      });
    });
    it("removes trailing characters", () => {
      assertShrinks(codec.anyString(), (s) => s.startsWith("a"), "abc", "a");
    });
    it("sets unused characters to 'a'", () => {
      assertShrinks(codec.anyString(), (s) => s.endsWith("z"), "xyz", "aaz");
    });
  });
});

describe("shrinkLength", () => {
  it("doesn't guess for an empty playout", () => {
    const guesses = shrinkLength(new PickList());
    assertEquals(Array.from(guesses), []);
  });
  it("doesn't guess if no requests were provided", () => {
    const example = arb.array(arb.int(0, 1000));
    repeatTest(example, (picks) => {
      const guesses = shrinkLength(PickList.fromReplies(picks));
      assertEquals(Array.from(guesses), []);
    });
  });
  it("doesn't guess if all playouts are at the minimum", () => {
    const example = arb.array(arb.intRange({ minMin: 0 }));
    repeatTest(example, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const picks = ranges.map((r) => r.min);
      const guesses = shrinkLength(new PickList(reqs, picks));
      assertEquals(Array.from(guesses), []);
    });
  });
  it("tries shrinking trailing picks", () => {
    const playout = arb.array(arb.minMaxVal({ minMin: 0 }));

    repeatTest(playout, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const replies = ranges.map((r) => r.val);
      const picks = new PickList(reqs, replies).trim();
      const guesses = Array.from(shrinkLength(picks));

      if (picks.length === 0) {
        // Nothing to do if there are no picks.
        assertEquals(guesses, []);
        return;
      }
      assert(guesses.length > 0);

      // The last guess should be the empty playout.
      const last = guesses[guesses.length - 1];
      assertEquals(last, []);

      let prevSize = Number.POSITIVE_INFINITY;
      for (const guess of guesses) {
        // Check that it's a prefix of the original.
        assert(guess.length < picks.length);
        assertEquals(guess, replies.slice(0, guess.length));

        // Check that it's getting smaller.
        assert(
          guess.length < prevSize,
          `didn't shrink from ${prevSize} to ${guess.length}`,
        );

        prevSize = guess.length;
      }
    });
  });
});

describe("shrinkPicksFrom", () => {
  const shrinkPicks = shrinkPicksFrom(0);
  it("can't shrink an empty playout", () => {
    const guesses = Array.from(shrinkPicks(new PickList()));
    assertEquals(guesses, []);
  });
  it("replaces each pick with the minimum", () => {
    const roll = new PickRequest(1, 2);
    const picks = new PickList([roll, roll], [2, 2]);
    const guesses = Array.from(shrinkPicks(picks));
    assertEquals(guesses, [[1, 2], [1, 1]]);
  });
});
