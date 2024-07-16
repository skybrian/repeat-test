import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { shrinkPick } from "../src/shrink.ts";

describe("shrinkPick", () => {
  it("doesn't shrink a default value", () => {
    repeatTest(arb.int(1, 6), (reply) => {
      const req = new PickRequest(1, 6, { default: reply });
      const guesses = Array.from(shrinkPick(req, reply));
      assertEquals(guesses, []);
    });
  });
});
