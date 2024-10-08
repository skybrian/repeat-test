import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { done } from "../src/results.ts";
import { PickRequest } from "../src/picks.ts";
import { usePicks } from "../src/build.ts";
import { filtered, Paused, paused, Script } from "../src/script_class.ts";

const noPicks = usePicks();

const bool = Script.make("bool", (pick) => pick(PickRequest.bit) === 1);

const twoBools = bool.then("two bools", (a, pick) => {
  const b = pick(PickRequest.bit) === 1;
  return [a, b];
});

const threeBools = twoBools.then("three bools", ([a, b], pick) => {
  const c = pick(PickRequest.bit) === 1;
  return [a, b, c];
});

function countOnesAt(n: number): Paused<number> {
  return paused((pick) => {
    if (pick(PickRequest.bit) === 0) {
      return done(n);
    }
    return countOnesAt(n + 1);
  });
}

const countOnes = Script.fromPaused("count ones", countOnesAt(0));

const doubleOnes = countOnes.then("double ones", (n) => n * 2);

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

  describe("buildFrom", () => {
    it("executes a recursive script", () => {
      assertEquals(countOnes.buildFrom(noPicks), 0);
      assertEquals(countOnes.buildFrom(usePicks(1)), 1);
      assertEquals(countOnes.buildFrom(usePicks(1, 1)), 2);
      assertEquals(countOnes.buildFrom(usePicks(1, 1, 1)), 3);
    });

    it("executes a recursive script with a then function", () => {
      assertEquals(doubleOnes.buildFrom(noPicks), 0);
      assertEquals(doubleOnes.buildFrom(usePicks(1)), 2);
      assertEquals(doubleOnes.buildFrom(usePicks(1, 1)), 4);
      assertEquals(doubleOnes.buildFrom(usePicks(1, 1, 1)), 6);
    });
  });

  describe("maybeStep", () => {
    it("executes a single-step script", () => {
      assertEquals(bool.step(usePicks(1)), done(true));
    });

    it("executes a two-step script", () => {
      const first = twoBools.step(usePicks(1));
      assert(first instanceof Paused);

      assertEquals(first.step(usePicks(0)), done([true, false]));
    });

    it("executes a three-step script", () => {
      const first = threeBools.step(usePicks(0));
      assert(first instanceof Paused);

      const second = first.step(usePicks(1));
      assert(second instanceof Paused);

      assertEquals(second.step(usePicks(0)), done([false, true, false]));
    });

    it("executes a three-step script with a then function", () => {
      const first = doubleOnes.step(usePicks(1));
      assert(first instanceof Paused);

      const second = first.step(usePicks(1));
      assert(second instanceof Paused);

      const third = second.step(usePicks(0));
      assert(third instanceof Paused);

      assertEquals(third.step(usePicks()), done(4));
    });

    it("returns filtered for an invalid pick", () => {
      assertEquals(bool.step(usePicks(3)), filtered);
    });

    it("returns filtered for an invalid pick in the second step", () => {
      const first = twoBools.step(usePicks(1));
      assert(first !== filtered);
      assertFalse(first.done);
      assertEquals(first.step(usePicks(3)), filtered);
    });

    it("throws an error if the script does", () => {
      const fails = Script.make("fails", () => {
        throw new Error("failed");
      });

      assertThrows(
        () => fails.step(usePicks(3)),
        Error,
        "failed",
      );
    });
  });
});
