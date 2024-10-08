import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { Arbitrary, Pruned, Script } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";
import { repeatTest } from "@/runner.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, onePlayout, PlayoutSource } from "../src/backtracking.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { randomPicker, randomPlayouts } from "../src/random.ts";

import { propsFromGen } from "./lib/props.ts";
import { generate, makePickFunction, MiddlewareRequest } from "../src/build.ts";
import { orderedPlayouts } from "../src/ordered.ts";

describe("MiddlewareRequest", () => {
  it("throws an error if not intercepted", () => {
    const req = MiddlewareRequest.wrap(PickRequest.bit, () => () => 0);
    const pick = makePickFunction(minPlayout());
    assertThrows(
      () => req.buildPick(pick),
      Error,
      "should have been intercepted",
    );
  });
});

describe("makePickFunction", () => {
  const hi = Arbitrary.of("hi", "there");
  const bit = new PickRequest(0, 1);
  let pick = makePickFunction(minPlayout());

  beforeEach(() => {
    const playouts = randomPlayouts(123);
    playouts.startAt(0);
    pick = makePickFunction(playouts);
  });

  it("accepts a PickRequest", () => {
    assertEquals(pick(bit), 0);
  });

  it("accepts a Script", () => {
    const script = Script.make("hi", () => "hi");
    assertEquals(pick(script), "hi");
  });

  it("accepts a Pickable that's not a Script", () => {
    const hi = { buildPick: () => "hi" };
    assertEquals(pick(hi), "hi");
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

    const tracker = new PartialTracker(alwaysPick(3));
    const playouts = new PlayoutSource(tracker);
    playouts.startAt(0);
    pick = makePickFunction(playouts);

    assertEquals(pick(arb), 4);
  });

  it("throws an error when given an invalid argument", () => {
    assertThrows(
      () => pick("hi" as unknown as PickRequest),
      Error,
      "pick function called with an invalid argument",
    );
    assertThrows(
      () => pick({ buildScript: null } as unknown as PickRequest),
      Error,
      "pick function called with an invalid argument",
    );
    assertThrows(
      () => pick({ buildScript: { build: "hi" } } as unknown as PickRequest),
      Error,
      "pick function called with an invalid argument",
    );
  });
});

const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

const multiStep = bit.then("multi-step", (a, pick) => {
  const b = pick(PickRequest.bit);
  return `(${a}, ${b})`;
});

const fails = Script.make("fails", () => {
  throw new Error("oops!");
});

const bitReq = PickRequest.bit;

describe("generate", () => {
  const hello = Script.make("hello", () => "hi");

  it("generates a single value for a constant", () => {
    const gen = generate(hello, minPlayout());
    assertEquals(propsFromGen(gen), {
      val: "hi",
      name: "hello",
      reqs: [],
      replies: [],
    });
  });

  it("retries for a pruned multi-step build script", () => {
    const pruned = bit.then("pruned", (val) => {
      if (val === 0) {
        throw new Pruned("try again");
      }
      return val;
    });
    const gen = generate(pruned, orderedPlayouts());
    assertEquals(propsFromGen(gen), {
      val: 1,
      name: "pruned",
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("generates all values for a multi-step build script", () => {
    const playouts = orderedPlayouts();
    for (const expectedReplies of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const gen = generate(multiStep, playouts);
      assertEquals(propsFromGen(gen), {
        val: `(${expectedReplies[0]}, ${expectedReplies[1]})`,
        name: "multi-step",
        reqs: [bitReq, bitReq],
        replies: expectedReplies,
      });
    }
    assertFalse(generate(multiStep, playouts));
  });

  it("passes through an error thrown by the build function", () => {
    assertThrows(() => generate(fails, minPlayout()), Error, "oops");
  });

  const biased = new PickRequest(0, 1, {
    bias: () => 1,
  });
  const deep = Script.make("deep", (pick) => {
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
