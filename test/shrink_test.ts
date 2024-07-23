import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickList, PickRequest } from "../src/picks.ts";
import {
  shrink,
  shrinkLength,
  shrinkOptionsUntil,
  shrinkPicksFrom,
} from "../src/shrink.ts";
import Domain from "../src/codec_class.ts";
import * as codec from "../src/codecs.ts";

function assertShrinks<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
  result: T,
) {
  const gen = dom.regenerate(start);
  assert(gen, "couldn't regenerate the starting value");

  const smaller = shrink(dom.generator, interesting, gen);
  assert(smaller, "didn't find the expected smaller value");
  assertEquals(smaller.val, result);
}

function assertNoChange<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
) {
  assertShrinks(dom, interesting, start, start);
}

describe("shrink", () => {
  describe("for an int", () => {
    it("can't shrink the minimum value", () => {
      assertNoChange(codec.int(1, 6), () => true, 1);
    });
    it("can't shrink when the value is required", () => {
      repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
        assertNoChange(codec.int(min, max), (n) => n === val, val);
      });
    });
    it("shrinks an unused positive int to the minimum", () => {
      assertShrinks(codec.int(1, 6), () => true, 6, 1);
    });
    it("shrinks an unused negative int to the maximum", () => {
      assertShrinks(codec.int(-6, -1), () => true, -6, -1);
    });
    it("shrinks as far as possible for an inequality", () => {
      assertShrinks(codec.int(1, 6), (n) => n >= 3, 6, 3);
    });
  });
  describe("for an ascii character", () => {
    it("can't shrink 'a'", () => {
      assertNoChange(codec.asciiChar(), () => true, "a");
    });
    it("can't shrink when all characters are used", () => {
      repeatTest(arb.asciiChar(), (start) => {
        assertNoChange(codec.asciiChar(), (c) => c === start, start);
      });
    });
    it("shrinks an unused character to 'a'", () => {
      assertShrinks(codec.asciiChar(), () => true, "Z", "a");
    });
    it("shrinks a used character to a lower one that works", () => {
      assertShrinks(codec.asciiChar(), (s) => /[A-Z]/.test(s), "Z", "A");
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
    it("removes unused trailing characters", () => {
      assertShrinks(codec.anyString(), (s) => s.startsWith("a"), "abc", "a");
    });
    it("sets unused characters to 'a'", () => {
      assertShrinks(codec.anyString(), (s) => s.at(2) === "z", "xyz", "aaz");
    });
    it("removes unused leading characters", () => {
      assertShrinks(codec.anyString(), (s) => s.endsWith("z"), "xyz", "z");
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
  const shrink = shrinkPicksFrom(0);
  it("can't shrink an empty playout", () => {
    const guesses = shrink(new PickList());
    assertEquals(Array.from(guesses), []);
  });
  it("replaces each pick with the minimum", () => {
    const roll = new PickRequest(1, 2);
    const picks = new PickList([roll, roll], [2, 2]);
    const guesses = shrink(picks);
    assertEquals(Array.from(guesses), [[1, 2], [1, 1]]);
  });
});

describe("shrinkOptionsUntil", () => {
  it("can't shrink an empty playout", () => {
    const guesses = shrinkOptionsUntil(0)(new PickList());
    assertEquals(Array.from(guesses), []);
  });
  it("removes an option at the end of the playout", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = new PickList([bit, roll], [1, 6]);
    const guesses = shrinkOptionsUntil(2)(picks);
    assertEquals(Array.from(guesses), [[]]);
  });
  it("removes an option with something after it", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = new PickList([bit, roll, roll], [1, 6, 3]);
    const guesses = shrinkOptionsUntil(2)(picks);
    assertEquals(Array.from(guesses), [[3]]);
  });
  it("removes two options", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = new PickList([bit, roll, bit, roll, roll], [1, 6, 1, 3, 5]);
    const guesses = shrinkOptionsUntil(4)(picks);
    assertEquals(Array.from(guesses), [[1, 6, 5], [5]]);
  });
});
