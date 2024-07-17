import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import { shrinkPick } from "../src/shrink.ts";

describe("shrinkPick", () => {
  it("doesn't shrink a default value", () => {
    const req = new PickRequest(1, 6);
    const guesses = Array.from(shrinkPick(req, 1));
    assertEquals(guesses, []);
  });
});
