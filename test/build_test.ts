import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Arbitrary, Pruned, Script } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, PlayoutSource } from "../src/backtracking.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { randomPlayouts } from "../src/random.ts";

import { makePickFunction, MiddlewareRequest } from "../src/build.ts";

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
