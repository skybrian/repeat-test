import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Arbitrary, Filtered, Script } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, PlayoutSource } from "../src/backtracking.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { randomPlayouts } from "../src/random.ts";

import { makePickFunction, MiddlewareRequest, usePicks } from "../src/build.ts";

describe("MiddlewareRequest", () => {
  it("throws an error if not intercepted", () => {
    const req = MiddlewareRequest.wrap(PickRequest.bit, () => () => 0);
    const pick = makePickFunction(minPlayout());
    assertThrows(
      () => req.buildFrom(pick),
      Error,
      "should have been intercepted",
    );
  });
});

const bitReq = PickRequest.bit;

function useRandomPicks() {
  const playouts = randomPlayouts(123);
  playouts.startAt(0);
  return makePickFunction(playouts);
}

describe("makePickFunction", () => {
  let pick = usePicks();

  beforeEach(() => {
    pick = usePicks();
  });

  it("accepts a PickRequest", () => {
    pick = usePicks(0);
    assertEquals(pick(bitReq), 0);
    pick = usePicks(1);
    assertEquals(pick(bitReq), 1);
  });

  it("throws filtered for an invalid pick", () => {
    pick = usePicks(42);
    assertThrows(() => pick(bitReq), Filtered);
  });

  it("accepts a Script", () => {
    const script = Script.make("hi", () => "hi");
    assertEquals(pick(script), "hi");
  });

  it("accepts a Pickable that's not a Script", () => {
    const hi = { buildFrom: () => "hi" };
    assertEquals(pick(hi), "hi");
  });

  it("accepts an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    assertEquals(pick(hi), "hi");
  });

  it("filters an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = (x: string) => x !== "hi";
    pick = useRandomPicks();
    assertEquals(pick(hi, { accept }), "there");
  });

  it("can filter out every value", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = () => false;
    pick = useRandomPicks();
    assertThrows(() => pick(hi, { accept }), Filtered);
    pick = usePicks();
    assertThrows(() => pick(hi, { accept }), Filtered);
  });

  it("gives up eventually", () => {
    const accept = () => false;
    pick = useRandomPicks();
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
        throw new Filtered("try again");
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
