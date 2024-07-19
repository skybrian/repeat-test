import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import {
  changePickGuesses,
  pickGuesses,
  shorterGuesses,
  shrink,
} from "../src/shrink.ts";
import { Playout } from "../src/playouts.ts";
import Arbitrary from "../src/arbitrary_class.ts";

function assertShrink<T>(
  choices: Arbitrary<T>,
  interesting: (arg: T) => boolean,
  start: T,
  result: T,
) {
  const startSol = choices.findSolution((val) => val === start);
  assert(startSol, "didn't find starting solution");

  const smaller = shrink(choices, startSol, interesting);
  assert(smaller, "didn't find a smaller solution");
  assertEquals(smaller.val, result);
}

describe("shrink", () => {
  describe("for a single pick", () => {
    it("returns the same solution when already at the minimum", () => {
      assertShrink(arb.int(1, 6), () => true, 1, 1);
    });
    it("shrinks an int to the minimum", () => {
      assertShrink(arb.int(1, 6), () => true, 6, 1);
    });
    it("finds a smaller int", () => {
      assertShrink(arb.int(1, 6), (n) => n >= 3, 6, 3);
    });
  });
  describe("for an ascii letter", () => {
    it("returns 'a' when given 'a'", () => {
      assertShrink(arb.asciiLetter(), () => true, "a", "a");
    });
    it("shrinks 'Z' to 'a'", () => {
      assertShrink(arb.asciiLetter(), () => true, "z", "a");
    });
  });
});

describe("shorterGuesses", () => {
  it("doesn't guess for an empty playout", () => {
    const playout = new Playout([]);
    const guesses = Array.from(shorterGuesses(playout));
    assertEquals(guesses, []);
  });
  it("doesn't guess if no requests were provided", () => {
    const example = arb.array(arb.int(0, 1000));
    repeatTest(example, (picks) => {
      const playout = new Playout(picks);
      const guesses = Array.from(shorterGuesses(playout));
      assertEquals(guesses, []);
    });
  });
  it("doesn't guess if all playouts are at the minimum", () => {
    const example = arb.array(arb.intRange());
    repeatTest(example, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const picks = ranges.map((r) => r.min);
      const playout = new Playout(picks, { reqs });
      const guesses = Array.from(shorterGuesses(playout));
      assertEquals(guesses, []);
    });
  });
  it("tries removing trailing picks", () => {
    const playout = arb.from((pick) => {
      const ranges: arb.Range[] = [];
      const picks: number[] = [];
      while (picks.length < 2 || pick(arb.boolean())) {
        const req = pick(arb.intRange({ minSize: 2 }));
        ranges.push(req);
        picks.push(pick(arb.int(req.min + 1, req.max)));
      }
      return { ranges, picks };
    });
    repeatTest(playout, ({ ranges, picks }) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const playout = new Playout(picks, { reqs });
      const guesses = Array.from(shorterGuesses(playout));
      assert(guesses.length > 0);

      // The last guess should remove one pick.
      const last = guesses[guesses.length - 1];
      assertEquals(last.length, picks.length - 1);

      let prevSize = 0;
      for (const guess of guesses) {
        assert(guess.length > prevSize);
        assert(guess.length < picks.length);
        // Check that it's a prefix of the original.
        for (let i = 0; i < guess.length; i++) {
          assertEquals(guess[i], picks[i]);
        }
        prevSize = guess.length;
      }
    });
  });
});

describe("changePickGuesses", () => {
  it("doesn't guess for an empty playout", () => {
    const playout = new Playout([]);
    const guesses = Array.from(changePickGuesses(playout));
    assertEquals(guesses, []);
  });
  it("replaces one pick with the minimum", () => {
    const roll = new PickRequest(1, 2);
    const playout = new Playout([2, 2], {
      reqs: [roll, roll],
    });
    const guesses = Array.from(changePickGuesses(playout));
    assertEquals(guesses, [[1, 2], [2, 1]]);
  });
});

describe("pickGuesses", () => {
  it("doesn't guess when already at the minimum", () => {
    const req = new PickRequest(1, 6);
    const guesses = Array.from(pickGuesses(req, 1));
    assertEquals(guesses, []);
  });
  it("guesses smaller values", () => {
    const req = new PickRequest(1, 7);
    const guesses = Array.from(pickGuesses(req, 7));
    assertEquals(guesses, [4, 6]);
  });
});
