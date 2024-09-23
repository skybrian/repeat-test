import type { PickSet } from "../src/generated.ts";

import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { describe, it } from "@std/testing/bdd";
import { minPlayout } from "../src/backtracking.ts";
import { generate } from "../src/generated.ts";
import { noChange } from "../src/picks.ts";

const frozen: PickSet<readonly string[]> = {
  label: "frozen",
  generateFrom: () => Object.freeze(["frozen"]),
};

const mutable: PickSet<string[]> = {
  label: "mutable",
  generateFrom: () => ["mutable"],
};

describe("Gen", () => {
  describe("val", () => {
    it("doesn't regenerate a frozen object", () => {
      const gen = generate(frozen, minPlayout());
      assert(gen !== undefined);
      const val = gen.val;
      assertEquals(val, ["frozen"]);
      assert(gen.val === val);
    });

    it("regenerates a mutable object", () => {
      const gen = generate(mutable, minPlayout());
      assert(gen !== undefined);
      const val = gen.val;
      assertEquals(val, ["mutable"]);
      assert(gen.val !== val);
    });
  });

  describe("mutate", () => {
    it("does nothing if there are no edits", () => {
      const gen = generate(frozen, minPlayout());
      assert(gen !== undefined);
      assertEquals(gen.mutate(noChange), undefined);
    });
  });
});
