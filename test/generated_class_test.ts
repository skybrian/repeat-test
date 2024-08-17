import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { Arbitrary } from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { minPlayout, onePlayout } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";
import { generate } from "../src/generated_class.ts";
import type { PickSet } from "../src/pick_function.ts";

const hello: PickSet<string> = {
  label: "hello",
  generateFrom: () => "hi",
};

const fails: PickSet<unknown> = {
  label: "fails",
  generateFrom: () => {
    throw new Error("oops!");
  },
};

describe("generate", () => {
  it("generates a single value for a constant", () => {
    const gen = generate(hello, minPlayout());
    assertEquals(gen, {
      ok: true,
      val: "hi",
      reqs: [],
      replies: [],
    });
  });

  it("passes through an error thrown by the PickSet", () => {
    assertThrows(() => generate(fails, minPlayout()), Error, "oops");
  });

  const biased = new PickRequest(0, 1, {
    bias: ((uniform) => uniform(0, 99999) > 0 ? 1 : 0),
  });
  const deep = Arbitrary.from((pick) => {
    let picks = 0;
    while (pick(biased) === 1) {
      picks++;
    }
    return picks;
  });

  it("limits generation to 1000 picks by default", () => {
    const gen = generate(deep, onePlayout(randomPicker(123)));
    assert(gen !== undefined);
    assertEquals(gen.val, 1000);
  });

  it("limits generation to the provided number of picks", () => {
    const limit = Arbitrary.from(new PickRequest(0, 10000));
    repeatTest(limit, (limit) => {
      const gen = generate(deep, onePlayout(randomPicker(123)), { limit });
      assert(gen !== undefined);
      assertEquals(gen.val, limit);
    }, { reps: 100 });
  });
});
