import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { filtered } from "../src/results.ts";
import { PickRequest } from "../src/picks.ts";
import { usePicks } from "../src/build.ts";
import { done, Paused, Script } from "../src/script_class.ts";

const bool = Script.make("bool", (pick) => pick(PickRequest.bit) === 1);

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
});

describe("Paused", () => {
  describe("step", () => {
    it("executes a single-step script", () => {
      const start = bool.paused;
      assert(start instanceof Paused);
      assertEquals(start.key, 0);
      assertEquals(start.step(usePicks(1)), done(true));
    });

    it("returns filtered for an invalid pick", () => {
      const start = bool.paused;
      assert(start instanceof Paused);

      assertEquals(start.step(usePicks(3)), filtered);
    });

    it("throws an error if the script does", () => {
      const fails = Script.make("fails", () => {
        throw new Error("failed");
      });
      const start = fails.paused;
      assert(start instanceof Paused);

      assertThrows(
        () => start.step(usePicks(3)),
        Error,
        "failed",
      );
    });
  });
});
