import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import { Arbitrary } from "@/arbitrary.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, onePlayout, Pruned } from "../src/backtracking.ts";
import { PartialTracker } from "../src/searches.ts";
import { randomPicker } from "../src/random.ts";

import { generate, Generated, makePickFunction } from "../src/generated.ts";
import type { PickSet } from "../src/generated.ts";
import { arb } from "@/mod.ts";

const bit = new PickRequest(0, 1);
const hi = Arbitrary.of("hi", "there");

describe("makePickFunction", () => {
  let pick = makePickFunction(minPlayout());

  beforeEach(() => {
    const search = new PartialTracker();
    search.startAt(0);
    pick = makePickFunction(search);
  });

  it("accepts a PickRequest", () => {
    assertEquals(pick(bit), 0);
  });

  it("accepts an Arbitrary", () => {
    assertEquals(pick(hi), "hi");
  });

  it("filters an Arbitrary", () => {
    const accept = (x: string) => x !== "hi";
    assertEquals(pick(hi, { accept }), "there");
  });

  it("can filter out every value", () => {
    const accept = () => false;
    assertThrows(() => pick(hi, { accept }), Pruned);
  });

  it("gives up eventually", () => {
    const accept = () => false;
    assertThrows(
      () => pick(arb.string(), { accept }),
      Error,
      "accept() returned false 1000 times for string; giving up",
    );
  });

  it("retries a pick with a different playout", () => {
    const roll = new PickRequest(1, 6);
    const arb = Arbitrary.from((pick) => {
      const n = pick(roll);
      if (n === 3) {
        throw new Pruned("try again");
      }
      return n;
    });

    const search = new PartialTracker();
    search.pickSource = alwaysPick(3);
    search.startAt(0);
    pick = makePickFunction(search);

    assertEquals(pick(arb), 4);
  });
});

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
    assertEquals(gen, new Generated(hello, [], [], "hi"));
  });

  it("passes through an error thrown by the PickSet", () => {
    assertThrows(() => generate(fails, minPlayout()), Error, "oops");
  });

  const biased = new PickRequest(0, 1, {
    bias: () => 1,
  });
  const deep = Arbitrary.from((pick) => {
    let picks = 0;
    while (pick(biased) === 1) {
      picks++;
    }
    return picks;
  });

  it("can limit generation to the provided number of picks", () => {
    const limit = Arbitrary.from(new PickRequest(0, 10000));
    repeatTest(limit, (limit) => {
      const gen = generate(deep, onePlayout(randomPicker(123)), { limit });
      assert(gen !== undefined);
      assertEquals(gen.val, limit);
    }, { reps: 100 });
  });
});
