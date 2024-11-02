import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

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

  describe("run", () => {
    it("executes a script", () => {
      assertEquals(bool.run(usePicks(1)), true);
    });

    it("returns filtered for an invalid pick", () => {
      assertEquals(bool.run(usePicks(3)), filtered);
    });

    it("throws an error if the script does", () => {
      const fails = Script.make("fails", () => {
        throw new Error("failed");
      });
      assertThrows(
        () => fails.run(usePicks(3)),
        Error,
        "failed",
      );
    });
  });

  describe("with", () => {
    it("returns a new script with the given name", () => {
      const original = Script.make("original", () => true);
      const renamed = original.with({ name: "renamed" });
      assertEquals(renamed.name, "renamed");
    });

    it("returns a new script with cachable set to true", () => {
      const original = Script.make("original", () => true);
      assertFalse(original.opts.cachable);
      const cached = original.with({ cachable: true });
      assert(cached.opts.cachable);
    });
  });
});
