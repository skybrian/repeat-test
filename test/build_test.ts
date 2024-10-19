import type { PickFunction } from "@/arbitrary.ts";
import type { GenProps } from "./lib/props.ts";
import type { Call } from "../src/calls.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Arbitrary, Filtered, Script } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { CallBuffer, regen } from "../src/calls.ts";
import { Backtracker } from "../src/backtracking.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { randomPlayouts } from "../src/random.ts";
import { makePickFunction, playbackResponder, usePicks } from "../src/build.ts";

const bitReq = PickRequest.bit;

function propsFromCall<T>(c: Call<T>): GenProps<T | typeof regen> {
  const { arg, picks, val } = c;
  const name = (arg instanceof Script) ? arg.name : arg.toString();
  return {
    val,
    name,
    reqs: picks.reqs,
    replies: picks.replies,
  };
}

describe("makePickFunction", () => {
  let pick = usePicks();
  let buf = new CallBuffer();

  beforeEach(() => {
    pick = logPicks();
  });

  function logPicks(...picks: number[]): PickFunction {
    buf = new CallBuffer();
    const responder = playbackResponder([...picks]);
    return makePickFunction(responder, { log: buf });
  }

  function logRandomPicks() {
    buf = new CallBuffer();
    const playouts = randomPlayouts(123);
    playouts.startAt(0);
    return makePickFunction(playouts, { log: buf });
  }

  function checkLog(...expected: GenProps<unknown>[]) {
    const actual: GenProps<unknown>[] = [];
    for (const call of buf.takeLog().calls) {
      actual.push(propsFromCall(call));
    }
    assertEquals(actual, expected);
  }

  it("accepts a PickRequest", () => {
    pick = logPicks(0);
    assertEquals(pick(bitReq), 0);
    checkLog({ name: "0..1", val: 0, reqs: [bitReq], replies: [0] });

    pick = logPicks(1);
    assertEquals(pick(bitReq), 1);
    checkLog({ name: "0..1", val: 1, reqs: [bitReq], replies: [1] });
  });

  it("throws filtered for an invalid pick", () => {
    pick = usePicks(42);
    assertThrows(() => pick(bitReq), Filtered);
  });

  it("accepts a Script that makes no picks", () => {
    const script = Script.make("hi", () => "hello");
    assertEquals(pick(script), "hello");
    checkLog({ name: "hi", val: regen, reqs: [], replies: [] });
  });

  it("caches the value of a Script where cachable is true", () => {
    const script = Script.make("hi", () => "hello", { cachable: true });
    assertEquals(pick(script), "hello");
    checkLog({
      name: "hi",
      val: "hello",
      reqs: [],
      replies: [],
    });
  });

  it("accepts a Pickable that's not a Script", () => {
    const hi = { buildFrom: () => "hi" };
    assertEquals(pick(hi), "hi");
    checkLog({ name: "untitled", val: regen, reqs: [], replies: [] });
  });

  it("accepts a PickRequest followed by a Script", () => {
    const hi = Script.make("hi", () => "hello");
    pick = logPicks(1, 0);
    assertEquals(pick(bitReq), 1);
    assertEquals(pick(hi), "hello");
    checkLog({
      name: "0..1",
      val: 1,
      reqs: [bitReq],
      replies: [1],
    }, {
      name: "hi",
      val: regen,
      reqs: [],
      replies: [],
    });
  });

  it("accepts an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    assertEquals(pick(hi), "hi");
    checkLog({ name: "2 examples", val: regen, reqs: [bitReq], replies: [0] });
  });

  it("accepts an Arbitrary that calls an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const wrapped = Arbitrary.from((pick) => pick(hi)).with({
      name: "wrapped",
    });
    pick = logPicks(1);
    assertEquals(pick(wrapped), "there");
    checkLog({
      name: "wrapped",
      val: regen,
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("filters an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = (x: string) => x !== "hi";
    pick = logRandomPicks();
    assertEquals(pick(hi, { accept }), "there");
    checkLog({
      name: "2 examples",
      val: regen,
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("accepts an Arbitrary that calls a filtered Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = (x: string) => x !== "hi";
    const wrapped = Arbitrary.from((pick) => pick(hi, { accept })).with({
      name: "wrapped",
    });
    pick = logRandomPicks();
    assertEquals(pick(wrapped), "there");
    checkLog({
      name: "wrapped",
      val: regen,
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("can filter out every value", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = () => false;
    pick = logRandomPicks();
    assertThrows(() => pick(hi, { accept }), Filtered);
    pick = usePicks();
    assertThrows(() => pick(hi, { accept }), Filtered);
  });

  it("gives up eventually", () => {
    const accept = () => false;
    pick = logRandomPicks();
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
    const playouts = new Backtracker(tracker);
    playouts.startAt(0);
    pick = makePickFunction(playouts, { log: buf });

    assertEquals(pick(arb), 4);
    checkLog({ name: "untitled", val: regen, reqs: [roll], replies: [4] });
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
