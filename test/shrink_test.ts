import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import type { Domain } from "@/domain.ts";
import * as dom from "@/doms.ts";

import { minMaxVal } from "./lib/ranges.ts";

import { type IntEditor, PickRequest } from "../src/picks.ts";
import {
  shrink,
  shrinkLength,
  shrinkOptionsUntil,
  shrinkPicksFrom,
} from "../src/shrink.ts";
import type { PickSet, Playout } from "../src/generated.ts";
import { Generated } from "@/arbitrary.ts";

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

  const smaller = shrink(gen, interesting);
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
      }, { reps: 10 });
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
      }, { reps: 10 });
    });
    it("shrinks all fields to their minimums", () => {
      repeatTest(pair, (start) => {
        assertShrinks(pair, (_r) => true, start, { a: 0, b: "" });
      }, { reps: 100 });
    });
    it("shrinks the first field if the second is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.b === b, { a, b }, { a: 0, b });
      }, { reps: 10 });
    });
    it("shrinks the second field if the first is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.a === a, { a, b }, { a, b: "" });
      }, { reps: 100 });
    });
  });
});

function playout(reqs: PickRequest[], replies: number[]): Playout {
  return { reqs, replies };
}

function fromReplies(replies: number[]): Playout {
  const reqs = replies.map((r) => new PickRequest(r, r));
  return playout(reqs, replies);
}

function mutate(
  reqs: PickRequest[],
  seed: number[],
  edit: IntEditor,
): number[] {
  const fakeSet: PickSet<string> = {
    label: "(fake)",
    generateFrom: (pick) => {
      for (const req of reqs) {
        pick(req);
      }
      return "ignored";
    },
  };

  const gen = new Generated(fakeSet, reqs, seed, "ignored");
  const result = gen.mutate(edit);
  assert(result !== undefined, "expected a result from mutate");

  return result.trimmedPlayout().replies;
}

function failedEdits(
  { reqs, replies }: Playout,
  edits: Iterable<IntEditor>,
): number[][] {
  return Array.from(edits).map((edit) => mutate(reqs, replies, edit));
}

describe("shrinkLength", () => {
  it("doesn't guess for an empty playout", () => {
    const edits = shrinkLength(fromReplies([]));
    assertEquals(Array.from(edits), []);
  });
  it("tries shrinking trailing picks", () => {
    const ranges = arb.array(minMaxVal({ minMin: 0 }));

    repeatTest(ranges, (ranges, console) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const replies = ranges.map((r) => r.val);
      const guesses = failedEdits(
        { reqs, replies },
        shrinkLength({ reqs, replies }),
      );

      if (reqs.length === 0) {
        // Nothing to do if there are no picks.
        assertEquals(guesses, []);
        return;
      }

      assert(guesses.length > 0);
      assertEquals(guesses.at(-1), [], "last edit should be empty");

      let prevSize = Number.POSITIVE_INFINITY;
      for (const guess of guesses) {
        // Check that it's a prefix of the original.
        console.log("guess", guess);
        assertEquals(guess, replies.slice(0, guess.length));

        // Check that it's getting smaller.
        assert(
          guess.length <= prevSize,
          `didn't shrink from ${prevSize} to ${guess.length}`,
        );

        prevSize = guess.length;
      }
    });
  });
});

describe("shrinkPicksFrom", () => {
  const strategy = shrinkPicksFrom(0);
  it("can't shrink an empty playout", () => {
    const guesses = strategy.edits(fromReplies([]));
    assertEquals(Array.from(guesses), []);
  });
  it("replaces each pick with the minimum", () => {
    const roll = new PickRequest(1, 2);
    const picks = playout([roll, roll], [2, 2]);
    const edits = strategy.edits(picks);
    const guesses = failedEdits(
      { reqs: picks.reqs, replies: picks.replies },
      edits,
    );
    assertEquals(guesses, [[1, 2], []]);
  });
  it("recovers if the new picks go out of range", () => {
    const lo = new PickRequest(1, 2);
    const hi = new PickRequest(3, 4);
    const seed = playout([lo, hi], [2, 4]);
    const edits = Array.from(strategy.edits(seed));
    const picks = mutate([lo, lo], [2, 4], edits[0]);
    assertEquals(picks, []);
  });
});

describe("shrinkOptionsUntil", () => {
  it("can't shrink an empty playout", () => {
    const strategy = shrinkOptionsUntil(0);
    const edits = strategy.edits(fromReplies([]));
    assertEquals(Array.from(edits), []);
  });
  it("removes an option at the end of the playout", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = playout([bit, roll], [1, 6]);
    const strategy = shrinkOptionsUntil(2);
    const edits = strategy.edits(picks);
    assertEquals(failedEdits(picks, edits), [[]]);
  });
  it("removes an option with something after it", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = playout([bit, roll, bit, roll], [1, 6, 1, 5]);
    const strategy = shrinkOptionsUntil(2);
    const edits = strategy.edits(picks);
    assertEquals(failedEdits(picks, edits), [[1, 5]]);
  });
  it("removes two options", () => {
    const bit = new PickRequest(0, 1);
    const roll = new PickRequest(1, 6);
    const picks = playout(
      [bit, roll, bit, roll, bit, roll],
      [1, 6, 1, 3, 1, 5],
    );
    const strategy = shrinkOptionsUntil(4);
    const edits = strategy.edits(picks);
    assertEquals(failedEdits(picks, edits), [[1, 6, 1, 5], [1, 5]]);
  });
});
