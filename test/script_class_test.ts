import type { Pickable, PickFunction } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { Script } from "../src/script_class.ts";
import { onePlayout } from "../src/backtracking.ts";
import { makePickFunction } from "../src/build.ts";
import { PlaybackPicker } from "../src/picks.ts";
import { done } from "../src/results.ts";
import { PickRequest } from "@/arbitrary.ts";

function picks(...replies: number[]): PickFunction {
  const playouts = onePlayout(new PlaybackPicker(replies));
  assert(playouts.startAt(0));
  return makePickFunction(playouts);
}

const noPicks = picks();

describe("Script", () => {
  describe("from", () => {
    it("throws if given an invalid argument", () => {
      assertThrows(
        () => Script.from(null as unknown as Pickable<number>),
        Error,
        "Script.from() called with an invalid argument",
      );
    });
  });

  describe("step", () => {
    const hi = Script.make("hello", () => "hi");
    const hiThere = hi.then("hi there", (val) => val + " there");
    const hiThereAgain = hiThere.then("again", (val) => val + " again");

    function countOnes(n = 0): Script<number> {
      return Script.fromStep(`countOnes ${n}`, (pick) => {
        if (pick(PickRequest.bit) === 0) {
          return done(n);
        }
        return countOnes(n + 1);
      });
    }

    it("executes a single-step script", () => {
      assertEquals(hi.step(noPicks), done("hi"));
    });

    it("executes a two-step script", () => {
      const first = hiThere.step(noPicks);
      assert(first instanceof Script);

      assertEquals(first.step(noPicks), done("hi there"));
    });

    it("executes a three-step script", () => {
      const first = hiThereAgain.step(noPicks);
      assert(first instanceof Script);

      const second = first.step(noPicks);
      assert(second instanceof Script);

      assertEquals(second.step(noPicks), done("hi there again"));
    });

    it("executes a recursive script", () => {
      assertEquals(countOnes().buildFrom(noPicks), 0);
      assertEquals(countOnes().buildFrom(picks(1)), 1);
      assertEquals(countOnes().buildFrom(picks(1, 1)), 2);
      assertEquals(countOnes().buildFrom(picks(1, 1, 1)), 3);
    });
  });
});
