import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { filtered } from "../src/results.ts";
import { PickRequest } from "../src/picks.ts";
import { usePicks } from "../src/build.ts";
import { Script } from "../src/script_class.ts";

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

  describe("build", () => {
    it("executes a script", () => {
      assertEquals(bool.build(usePicks(1)), true);
    });

    it("returns filtered for an invalid pick", () => {
      assertEquals(bool.build(usePicks(3)), filtered);
    });

    it("throws an error if the script does", () => {
      const fails = Script.make("fails", () => {
        throw new Error("failed");
      });
      assertThrows(
        () => fails.build(usePicks(3)),
        Error,
        "failed",
      );
    });
  });
});
