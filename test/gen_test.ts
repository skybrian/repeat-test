import type { PickSet } from "../src/generated.ts";

import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { describe, it } from "@std/testing/bdd";
import { minPlayout } from "../src/backtracking.ts";
import { generate } from "../src/generated.ts";
import { noChange } from "../src/picks.ts";

const hello: PickSet<string> = {
  label: "hello",
  generateFrom: () => "hi",
};

describe("Gen", () => {
  describe("mutate", () => {
    it("does nothing if there are no edits", () => {
      const gen = generate(hello, minPlayout());
      assert(gen !== undefined);
      assertEquals(gen.mutate(noChange), undefined);
    });
  });
});
