import type { PickFunction } from "@/arbitrary.ts";
import type { GenProps } from "./lib/props.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { Arbitrary, Filtered, Script } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { CallBuffer, regen } from "../src/calls.ts";
import { Backtracker } from "../src/backtracking.ts";
import { PartialTracker } from "../src/partial_tracker.ts";
import { randomPlayouts } from "../src/random.ts";
import {
  makePickFunction,
  responderFromPicker,
  responderFromReplies,
  usePicks,
} from "../src/build.ts";

const bitReq = PickRequest.bit;

describe("makePickFunction", () => {
  let buf = new CallBuffer();
  let pick = logCalls();

  beforeEach(() => {
    pick = logCalls();
  });

  function logCalls(...picks: number[]): PickFunction {
    buf = new CallBuffer();
    const responder = responderFromReplies([...picks]);
    return makePickFunction(responder, { log: buf, logCalls: true });
  }

  function logRandomCalls() {
    buf = new CallBuffer();
    const playouts = randomPlayouts(123);
    playouts.startAt(0);
    return makePickFunction(playouts, { log: buf, logCalls: true });
  }

  function checkCalls(...expected: GenProps<unknown>[]) {
    const actual: GenProps<unknown>[] = [];
    const log = buf.takeLog();
    for (const { arg, val, group } of log.calls) {
      const name = (arg instanceof Script) ? arg.name : arg.toString();
      actual.push({
        name,
        val,
        reqs: group.reqs,
        replies: group.replies,
      });
    }
    assertEquals(actual, expected);
  }

  it("accepts a PickRequest", () => {
    pick = logCalls(0);
    assertEquals(pick(bitReq), 0);
    checkCalls({ name: "0..1", val: 0, reqs: [bitReq], replies: [0] });

    pick = logCalls(1);
    assertEquals(pick(bitReq), 1);
    checkCalls({ name: "0..1", val: 1, reqs: [bitReq], replies: [1] });
  });

  it("throws filtered for an invalid pick", () => {
    pick = usePicks(42);
    assertThrows(() => pick(bitReq), Filtered);
  });

  it("accepts a Script that makes no picks", () => {
    const script = Script.make("hi", () => "hello");
    assertEquals(pick(script), "hello");
    checkCalls({ name: "hi", val: regen, reqs: [], replies: [] });
  });

  it("caches the value of a Script where cachable is true", () => {
    const script = Script.make("hi", () => "hello", { cachable: true });
    assertEquals(pick(script), "hello");
    checkCalls({
      name: "hi",
      val: "hello",
      reqs: [],
      replies: [],
    });
  });

  it("accepts a Pickable that's not a Script", () => {
    const hi = { buildFrom: () => "hi" };
    assertEquals(pick(hi), "hi");
    checkCalls({ name: "untitled", val: regen, reqs: [], replies: [] });
  });

  it("accepts a PickRequest followed by a Script", () => {
    const hi = Script.make("hi", () => "hello");
    pick = logCalls(1, 0);
    assertEquals(pick(bitReq), 1);
    assertEquals(pick(hi), "hello");
    checkCalls({
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
    checkCalls({
      name: "2 examples",
      val: regen,
      reqs: [bitReq],
      replies: [0],
    });
  });

  it("accepts an Arbitrary that calls an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const wrapped = Arbitrary.from((pick) => pick(hi)).with({
      name: "wrapped",
    });
    pick = logCalls(1);
    assertEquals(pick(wrapped), "there");
    checkCalls({
      name: "wrapped",
      val: regen,
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("throws wheen accept fails and the responder can't backtrack", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = (x: string) => x !== "hi";
    const responder = responderFromPicker(alwaysPick(0));
    const pick = makePickFunction(responder);
    assertThrows(() => pick(hi, { accept }), Filtered);
  });

  it("filters an Arbitrary", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = (x: string) => x !== "hi";
    pick = logRandomCalls();
    assertEquals(pick(hi, { accept }), "there");
    checkCalls({
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
    pick = logRandomCalls();
    assertEquals(pick(wrapped), "there");
    checkCalls({
      name: "wrapped",
      val: regen,
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("can filter out every value", () => {
    const hi = Arbitrary.of("hi", "there");
    const accept = () => false;
    pick = logRandomCalls();
    assertThrows(() => pick(hi, { accept }), Filtered);
    pick = usePicks();
    assertThrows(() => pick(hi, { accept }), Filtered);
  });

  it("gives up eventually", () => {
    const accept = () => false;
    pick = logRandomCalls();
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
    pick = makePickFunction(playouts, { log: buf, logCalls: true });

    assertEquals(pick(arb), 4);
    checkCalls({ name: "untitled", val: regen, reqs: [roll], replies: [4] });
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
