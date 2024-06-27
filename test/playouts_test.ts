import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickMin,
  IntPicker,
  PickRequest,
  PickRequestOptions,
} from "../src/picks.ts";

import { randomPicker } from "../src/random.ts";

import { PickLog, PlayoutBuffer, SpanLog } from "../src/playouts.ts";

describe("SpanLog", () => {
  describe("getSpans", () => {
    it("returns an empty array when there are no spans", () => {
      assertEquals(new SpanLog().getSpans(), { starts: [], ends: [] });
    });
    it("ignores an empty span", () => {
      const log = new SpanLog();
      log.startSpan(0);
      log.endSpan(0);
      assertEquals(log.getSpans(), { starts: [], ends: [] });
    });
    it("ignores a single-pick span", () => {
      const log = new SpanLog();
      log.startSpan(0);
      log.endSpan(1);
      assertEquals(log.getSpans(), { starts: [], ends: [] });
    });
    it("doesn't add a span when unwrap is set", () => {
      const log = new SpanLog();
      log.startSpan(0);
      log.startSpan(1);
      log.startSpan(2);
      log.endSpan(4);
      log.endSpan(5, { unwrap: true });
      log.endSpan(6);
      assertEquals(log.getSpans(), { starts: [0, 2], ends: [6, 4] });
    });
  });
});

describe("PickLog", () => {
  describe("truncate", () => {
    it("does nothing when clearing an empty log", () => {
      const log = new PickLog();
      log.truncate(0);
      assertEquals(log.length, 0);
      assertEquals(log.getPicks(), []);
    });
  });
});

export function validRequest(
  opts?: arb.IntRangeOptions,
): Arbitrary<PickRequest> {
  const range = arb.intRange(opts);

  return arb.from((pick) => {
    const { min, max } = pick(range);

    const opts: PickRequestOptions = {};
    if (pick(arb.boolean())) {
      opts.default = pick(arb.int(min, max));
    }
    return new PickRequest(min, max, opts);
  });
}

describe("PlayoutBuffer", () => {
  const validRequestAndReply = arb.from((pick) => {
    const req = pick(validRequest());
    const n = pick(req);
    return { req, n };
  });

  describe("record", () => {
    it("accepts any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const stack = new PlayoutBuffer(alwaysPick(n));
        assertEquals(stack.length, 0);
        assertEquals(stack.record().pick(req), n);
        assertEquals(stack.length, 1);
      });
    });
  });
  describe("play", () => {
    it("replays any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const stack = new PlayoutBuffer(alwaysPick(n));
        assertEquals(stack.record().pick(req), n);
        assertEquals(stack.play().pick(req), n);
        assertEquals(stack.length, 1);
      });
    });
  });

  describe("playNext", () => {
    function collectReplays(
      stack: PlayoutBuffer,
      requests: PickRequest[],
    ): Set<string> {
      const result = new Set<string>();

      let replay: IntPicker | null = stack.play();
      while (replay != null) {
        const picks: number[] = [];
        for (const req of requests) {
          picks.push(replay.pick(req));
        }
        const key = JSON.stringify(picks);
        assertFalse(result.has(key), `already saw ${key}`);
        result.add(key);

        replay = stack.playNext();
      }

      return result;
    }

    it("plays back every combination for an odometer", () => {
      const digit = new PickRequest(0, 9);
      const digits = Array(3).fill(digit);

      // set to 0, 0, 0
      const stack = new PlayoutBuffer(alwaysPickMin);
      const record = stack.record();
      digits.forEach((req) => record.pick(req));

      const combos = Array.from(collectReplays(stack, digits));
      assertEquals(combos[0], "[0,0,0]");
      assertEquals(combos[999], "[9,9,9]");
      assertEquals(combos.length, 1000);
    });

    it("always returns a combination of valid picks that hasn't been seen", () => {
      const example = arb.record({
        requests: arb.array(validRequest({ maxSize: 3 })),
        seed: arb.int32(),
      });
      repeatTest(example, ({ requests, seed }) => {
        const stack = new PlayoutBuffer(randomPicker(seed));

        // record some random picks
        const recorder = stack.record();
        const original: number[] = [];
        for (const req of requests) {
          const n = recorder.pick(req);
          assert(n >= req.min);
          assert(n <= req.max);
          original.push(n);
        }

        collectReplays(stack, requests);
      });
    });
  });
});
