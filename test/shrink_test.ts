import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";
import * as arb from "../src/arb.ts";
import { intRange, minMaxVal } from "../src/arbitraries/ranges.ts";
import { repeatTest } from "../src/runner.ts";

import { PickList, PickRequest } from "../src/picks.ts";
import {
  shrink,
  shrinkLength,
  shrinkOptionsUntil,
  shrinkPicksFrom,
} from "../src/shrink.ts";
import type { Domain } from "../src/domain_class.ts";
import * as dom from "../src/dom.ts";

function assertShrinks<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
  result: T,
) {
  const gen = dom.regenerate(start);
  if (!gen.ok) {
    fail(`couldn't regenerate the starting value: ${gen.message}`);
  }

  const smaller = shrink(dom.arb, interesting, gen);
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
      assertNoChange(dom.int(1, 6), () => true, 1);
    });
    it("can't shrink when the value is required", () => {
      repeatTest(minMaxVal(), ({ min, max, val }) => {
        assertNoChange(dom.int(min, max), (n) => n === val, val);
      });
    });
    it("shrinks an unused positive int to the minimum", () => {
      assertShrinks(dom.int(1, 6), () => true, 6, 1);
    });
    it("shrinks an unused negative int to the maximum", () => {
      assertShrinks(dom.int(-6, -1), () => true, -6, -1);
    });
    it("shrinks as far as possible for an inequality", () => {
      assertShrinks(dom.int(1, 6), (n) => n >= 3, 6, 3);
    });
  });
  describe("for an ascii character", () => {
    it("can't shrink 'a'", () => {
      assertNoChange(dom.asciiChar(), () => true, "a");
    });
    it("can't shrink when all characters are used", () => {
      repeatTest(arb.asciiChar(), (start) => {
        assertNoChange(dom.asciiChar(), (c) => c === start, start);
      });
    });
    it("shrinks an unused character to 'a'", () => {
      assertShrinks(dom.asciiChar(), () => true, "Z", "a");
    });
    it("shrinks a used character to a lower one that works", () => {
      assertShrinks(dom.asciiChar(), (s) => /[A-Z]/.test(s), "Z", "A");
    });
  });
  describe("for a string", () => {
    it("can't shrink an empty string", () => {
      assertNoChange(dom.string(), () => true, "");
    });
    it("can't shrink when there's no alternative", () => {
      repeatTest(arb.string(), (start) => {
        assertNoChange(dom.string(), (s) => s === start, start);
      }, { reps: 100 });
    });
    it("removes unused trailing characters", () => {
      assertShrinks(dom.string(), (s) => s.startsWith("a"), "abc", "a");
    });
    it("sets unused characters to 'a'", () => {
      assertShrinks(dom.string(), (s) => s.at(2) === "z", "xyz", "aaz");
    });
    it("removes unused leading characters", () => {
      assertShrinks(dom.string(), (s) => s.endsWith("z"), "xyz", "z");
    });
  });
  describe("for a record", () => {
    it("can't shrink an empty record", () => {
      assertNoChange(dom.record({}), () => true, {});
    });
    const pair = dom.record({ a: dom.int32(), b: dom.string() });
    it("can't shrink when there's no alternative", () => {
      repeatTest(pair, ({ a, b }) => {
        assertNoChange(pair, (r) => r.a === a && r.b === b, { a, b });
      }, { reps: 100 });
    });
    it("shrinks all fields to their minimums", () => {
      repeatTest(pair, (start) => {
        assertShrinks(pair, (_r) => true, start, { a: 0, b: "" });
      });
    });
    it("shrinks the first field if the second is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.b === b, { a, b }, { a: 0, b });
      }, { reps: 100 });
    });
    it("shrinks the second field if the first is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.a === a, { a, b }, { a, b: "" });
      });
    });
  });
});

describe("shrinkLength", () => {
  it("doesn't guess for an empty playout", () => {
    const guesses = shrinkLength(PickList.fromReplies([]));
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
    const example = arb.array(intRange({ minMin: 0 }));
    repeatTest(example, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const picks = ranges.map((r) => r.min);
      const guesses = shrinkLength(PickList.zip(reqs, picks));
      assertEquals(Array.from(guesses), []);
    });
  });
  it("tries shrinking trailing picks", () => {
    const playout = arb.array(minMaxVal({ minMin: 0 }));

    repeatTest(playout, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const replies = ranges.map((r) => r.val);
      const picks = PickList.zip(reqs, replies).trimmed();
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
    const guesses = shrink(PickList.fromReplies([]));
    assertEquals(Array.from(guesses), []);
  });
  it("replaces each pick with the minimum", () => {
    const roll = new PickRequest(1, 2);
    const picks = PickList.zip([roll, roll], [2, 2]);
    const guesses = shrink(picks);
    assertEquals(Array.from(guesses), [[1, 2], [1, 1]]);
  });
});

describe("shrinkOptionsUntil", () => {
  it("can't shrink an empty playout", () => {
    const guesses = shrinkOptionsUntil(0)(PickList.fromReplies([]));
    assertEquals(Array.from(guesses), []);
  });
  it("removes an option at the end of the playout", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = PickList.zip([bit, roll], [1, 6]);
    const guesses = shrinkOptionsUntil(2)(picks);
    assertEquals(Array.from(guesses), [[]]);
  });
  it("removes an option with something after it", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = PickList.zip([bit, roll, roll], [1, 6, 3]);
    const guesses = shrinkOptionsUntil(2)(picks);
    assertEquals(Array.from(guesses), [[3]]);
  });
  it("removes two options", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = PickList.zip([bit, roll, bit, roll, roll], [1, 6, 1, 3, 5]);
    const guesses = shrinkOptionsUntil(4)(picks);
    assertEquals(Array.from(guesses), [[1, 6, 5], [5]]);
  });
});
