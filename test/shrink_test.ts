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
  it("shrinks a non-default value to a default value", () => {
    const example = arb.from((pick) => {
      const defaultVal = pick(arb.int(1, 6));
      const next = defaultVal % 6 + 1;
      const reply = pick(
        arb.int(1, 6, { default: next }).filter((x) => x !== defaultVal),
      );
      return { defaultVal, reply };
    });
    repeatTest(example, ({ defaultVal, reply }) => {
      const req = new PickRequest(1, 6, { default: defaultVal });
      const guesses = Array.from(shrinkPick(req, reply));
      assertEquals(guesses, [defaultVal]);
    });
  });
});
