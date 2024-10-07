import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Script } from "../src/script_class.ts";

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

  describe("toSteps", () => {
    it("returns no steps for a simple build script", () => {
      const hi = Script.make("hello", () => "hi");
      assertEquals(hi.toSteps(), { base: hi, steps: [] });
    });
  });
});
