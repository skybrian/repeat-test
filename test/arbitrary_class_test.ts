import type { Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertFirstGenerated, assertValues } from "./lib/asserts.ts";

import { IntRequest } from "../src/picks.ts";
import { Arbitrary } from "../src/entrypoints/core.ts";

const bit = new IntRequest(0, 1);

describe("Arbitrary", () => {
  describe("from", () => {
    describe("given an IntRequest", () => {
      it("generates both values", () => {
        const arbitrary = Arbitrary.from(bit);
        assertEquals("0..1", arbitrary.name);
        assertValues(arbitrary, [0, 1]);
      });
    });

    describe("given a Pickable", () => {
      const answer: Pickable<string> = {
        directBuild: (pick) => pick(bit) == 1 ? "yes" : "no",
      };
      it("generates both values", () => {
        const arbitrary = Arbitrary.from(answer);
        assertEquals(arbitrary.name, "untitled");
        assertValues(arbitrary, ["no", "yes"]);
      });
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const original = Arbitrary.from(new IntRequest(1, 6));
      assertFirstGenerated(original, [{ val: 1, picks: [1] }]);

      const mapped = original.map((n) => n * 2);
      assertFirstGenerated(mapped, [{ val: 2, picks: [1] }]);
    });
  });
});
