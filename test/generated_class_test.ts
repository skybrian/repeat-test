import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { minPlayout, onePlayout, playback } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";
import { generate } from "../src/generated_class.ts";
import { PickSet } from "../src/pick_function.ts";

const hello: PickSet<string> = {
  label: "hello",
  generatePick: () => "hi",
};

describe("generate", () => {
  it("generates a single value for a constant", () => {
    const gen = generate(hello, minPlayout());
    assert(gen !== undefined);
    assertEquals(gen.val, "hi");
    assertEquals(gen.replies(), []);
  });
  it("passes through an error thrown in a nested Arbitrary", () => {
    const fails = Arbitrary.from((pick) => {
      if (pick(Arbitrary.of(false, true))) {
        throw new Error("oops");
      }
      return "ok";
    });
    const outer = Arbitrary.from((pick) => pick(fails));
    assertThrows(() => generate(outer, playback([1])), Error, "oops");
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
    const arb = Arbitrary.from(new PickRequest(0, 10000));
    repeatTest(arb, (limit) => {
      const gen = generate(deep, onePlayout(randomPicker(123)), { limit });
      assert(gen !== undefined);
      assertEquals(gen.val, limit);
    }, { reps: 100 });
  });
});
