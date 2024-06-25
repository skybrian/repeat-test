import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { Arbitrary } from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickMin,
  IntPicker,
  PickRequest,
  PickRequestOptions,
} from "../src/picks.ts";
import { randomPicker } from "../src/random.ts";

import { PickLog, PickStack, Solution } from "../src/solver.ts";

export function validRequest(
  opts?: arb.IntRangeOptions,
): Arbitrary<PickRequest> {
  const range = arb.intRange(opts);

  return arb.custom((pick) => {
    const { min, max } = pick(range);

    const opts: PickRequestOptions = {};
    if (pick(arb.boolean())) {
      opts.default = pick(arb.int(min, max));
    }
    return new PickRequest(min, max, opts);
  });
}

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

describe("PickStack", () => {
  const validRequestAndReply = arb.custom((pick) => {
    const req = pick(validRequest());
    const n = pick(req);
    return { req, n };
  });

  describe("record", () => {
    it("accepts any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const stack = new PickStack(alwaysPick(n));
        assertEquals(stack.length, 0);
        assertEquals(stack.record().pick(req), n);
        assertEquals(stack.length, 1);
      });
    });
  });
  describe("play", () => {
    it("replays any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const stack = new PickStack(alwaysPick(n));
        assertEquals(stack.record().pick(req), n);
        assertEquals(stack.play().pick(req), n);
        assertEquals(stack.length, 1);
      });
    });
  });

  describe("playNext", () => {
    function collectReplays(
      stack: PickStack,
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
      const stack = new PickStack(alwaysPickMin);
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
        const stack = new PickStack(randomPicker(seed));

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

describe("Solution", () => {
  describe("nestedPicks", () => {
    it("returns an empty list when there are no picks or spans", () => {
      const sol = new Solution(123, {
        picks: [],
        spanStarts: [],
        spanEnds: [],
      });
      assertEquals(sol.getNestedPicks(), []);
    });
    it("returns a list of picks when there are only picks", () => {
      const sol = new Solution(123, {
        picks: [1, 2, 3],
        spanStarts: [],
        spanEnds: [],
      });
      assertEquals(sol.getNestedPicks(), [1, 2, 3]);
    });
    it("makes empty nested lists when there are only spans", () => {
      const sol = new Solution(123, {
        picks: [],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[[]]]);
    });
    it("puts the pick first", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [1, 1],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [1, [[]]]);
    });
    it("puts the pick in the middle", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [0, 0],
        spanEnds: [1, 1],
      });
      assertEquals(sol.getNestedPicks(), [[[1]]]);
    });
    it("puts the pick last", () => {
      const sol = new Solution(123, {
        picks: [1],
        spanStarts: [0, 0],
        spanEnds: [0, 0],
      });
      assertEquals(sol.getNestedPicks(), [[[]], 1]);
    });
  });
});
