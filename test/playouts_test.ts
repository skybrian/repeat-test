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

import { PickLog, Playout, PlayoutBuffer, SpanLog } from "../src/playouts.ts";

function validPlayout(
  opts?: { maxSpanSize: number; maxDepth: number },
): Arbitrary<Playout> {
  const maxSpanSize = opts?.maxSpanSize ?? 3;
  const maxDepth = (opts?.maxDepth ?? 3) + 1; // Add one for placeholder
  const maxPicks = maxSpanSize;
  const maxSpins = maxDepth * maxSpanSize;

  return arb.from((pick) => {
    const picks: number[] = [];

    // Top-level span is a placeholder that will be removed
    const spanStarts = [0];
    const spanEnds = [NaN];

    const stack = [{ offset: 0, size: 0 }];

    for (let i = 0; i < maxSpins; i++) {
      if (stack.length === 0) break;
      if (!pick(arb.boolean())) {
        const span = stack.pop();
        if (span === undefined) break; // shouldn't happen
        spanEnds[span.offset] = picks.length;
        continue;
      }
      if (stack.length < maxDepth && pick(arb.boolean())) {
        stack.push({ offset: spanStarts.length, size: 0 });
        spanStarts.push(picks.length);
        spanEnds.push(NaN);
      }
      if (
        stack[stack.length - 1].size < maxSpanSize &&
        picks.length < maxPicks &&
        pick(arb.boolean())
      ) {
        stack[stack.length - 1].size++;
        picks.push(picks.length + 1);
      }
    }
    for (let span = stack.pop(); span !== undefined; span = stack.pop()) {
      spanEnds[span.offset] = picks.length;
    }

    spanStarts.splice(0, 1);
    spanEnds.splice(0, 1);

    return new Playout(picks, spanStarts, spanEnds);
  });
}

describe("Playout", () => {
  describe("getNestedPicks", () => {
    it("returns an empty list when there are no picks or spans", () => {
      const playout = new Playout([], [], []);
      assertEquals(playout.getNestedPicks(), []);
    });
    it("returns a list of picks when there are only picks", () => {
      const playout = new Playout([1, 2, 3], [], []);
      assertEquals(playout.getNestedPicks(), [1, 2, 3]);
    });
    it("interprets empty spans as sequential", () => {
      // This is actually ambigous. Could also be [[]].
      // But SpanLog shouldn't be emitting empty spans anyway.
      const playout = new Playout([], [0, 0], [0, 0]);
      assertEquals(playout.getNestedPicks(), [[], []]);
    });
    it("puts the pick first", () => {
      const playout = new Playout([123], [1, 1], [1, 1]);
      assertEquals(playout.getNestedPicks(), [123, [], []]);
    });
    it("puts the pick in the middle", () => {
      const playout = new Playout([123], [0, 0], [1, 1]);
      assertEquals(playout.getNestedPicks(), [[[123]]]);
    });
    it("puts the pick last", () => {
      const playout = new Playout([123], [0, 0], [0, 0]);
      assertEquals(playout.getNestedPicks(), [[], [], 123]);
    });
    it("handles empty spans anywhere", () => {
      const playout = new Playout([7, 8], [0, 0, 0], [2, 0, 1]);
      assertEquals(playout.getNestedPicks(), [[[], [7], 8]]);
    });
    it("returns a value for any valid playout", () => {
      repeatTest(validPlayout(), (p) => {
        p.getNestedPicks();
      });
    });
  });
});

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
    it("ignores a span that contains only a single span", () => {
      const log = new SpanLog();
      log.startSpan(0);
      log.startSpan(0);
      log.endSpan(2);
      log.endSpan(2);
      assertEquals(log.getSpans(), { starts: [0], ends: [2] });
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
