import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { pickGuesses, removeTrailingGuesses } from "../src/shrink.ts";
import { Playout } from "../src/playouts.ts";

describe("pickGuesses", () => {
  it("doesn't guess when already at the minimum", () => {
    const req = new PickRequest(1, 6);
    const guesses = Array.from(pickGuesses(req, 1));
    assertEquals(guesses, []);
  });
  it("guesses the minimum value", () => {
    const req = new PickRequest(1, 6);
    const guesses = Array.from(pickGuesses(req, 6));
    assertEquals(guesses, [1]);
  });
});

describe("removeTrailingGuesses", () => {
  it("doesn't guess for an empty playout", () => {
    const playout = new Playout([]);
    const guesses = Array.from(removeTrailingGuesses(playout));
    assertEquals(guesses, []);
  });
  it("doesn't guess if no requests were provided", () => {
    const example = arb.array(arb.int(0, 1000));
    repeatTest(example, (picks) => {
      const playout = new Playout(picks);
      const guesses = Array.from(removeTrailingGuesses(playout));
      assertEquals(guesses, []);
    });
  });
  it("doesn't guess if all playouts are at the minimum", () => {
    const example = arb.array(arb.intRange());
    repeatTest(example, (ranges) => {
      const reqs = ranges.map((r) => new PickRequest(r.min, r.max));
      const picks = ranges.map((r) => r.min);
      const playout = new Playout(picks, { reqs });
      const guesses = Array.from(removeTrailingGuesses(playout));
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
      const guesses = Array.from(removeTrailingGuesses(playout));
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
