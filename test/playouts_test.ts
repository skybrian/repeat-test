import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickDefault,
  alwaysPickMin,
  IntPicker,
  PickRequest,
  PickRequestOptions,
} from "../src/picks.ts";

import { randomPicker } from "../src/random.ts";

import {
  NestedPicks,
  Playout,
  PlayoutBuffer,
  PlayoutLog,
} from "../src/playouts.ts";

type NestedPickOpts = {
  minSpanSize?: number;
  maxSpanSize?: number;
  maxDepth?: number;
};

function nestedPicks(opts?: NestedPickOpts): Arbitrary<NestedPicks> {
  const minSpanSize = opts?.minSpanSize ?? 0;
  const maxSpanSize = opts?.maxSpanSize ?? 5;

  function makeSpan(maxDepth: number): Arbitrary<NestedPicks> {
    return arb.from((pick) => {
      const result: NestedPicks = [];
      while (
        result.length < minSpanSize ||
        (result.length < maxSpanSize && pick(arb.boolean()))
      ) {
        if (maxDepth > 0 && pick(arb.boolean())) {
          result.push(pick(makeSpan(maxDepth - 1)));
        } else {
          result.push(pick(arb.int(1, 6)));
        }
      }
      return result;
    });
  }
  return makeSpan(opts?.maxDepth ?? 5);
}

function picksToPlayout(input: NestedPicks): Playout {
  const picks: number[] = [];
  const spanStarts: number[] = [];
  const spanEnds: number[] = [];

  function walk(input: NestedPicks) {
    for (const item of input) {
      if (typeof item === "number") {
        picks.push(item);
      } else {
        const span = spanStarts.length;
        spanStarts.push(picks.length);
        spanEnds.push(NaN);
        walk(item);
        spanEnds[span] = picks.length;
      }
    }
  }
  walk(input);
  return new Playout(picks, spanStarts, spanEnds);
}

describe("Playout", () => {
  describe("toNestedPicks", () => {
    it("returns an empty list when there are no picks or spans", () => {
      const playout = new Playout([], [], []);
      assertEquals(playout.toNestedPicks(), []);
    });
    it("returns a list of picks when there are only picks", () => {
      const playout = new Playout([1, 2, 3], [], []);
      assertEquals(playout.toNestedPicks(), [1, 2, 3]);
    });
    it("interprets empty spans as sequential", () => {
      // This is actually ambigous. Could also be [[]].
      // But SpanLog shouldn't be emitting empty spans anyway.
      const playout = new Playout([], [0, 0], [0, 0]);
      assertEquals(playout.toNestedPicks(), [[], []]);
    });
    it("puts the pick first", () => {
      const playout = new Playout([123], [1, 1], [1, 1]);
      assertEquals(playout.toNestedPicks(), [123, [], []]);
    });
    it("puts the pick in the middle", () => {
      const playout = new Playout([123], [0, 0], [1, 1]);
      assertEquals(playout.toNestedPicks(), [[[123]]]);
    });
    it("puts the pick last", () => {
      const playout = new Playout([123], [0, 0], [0, 0]);
      assertEquals(playout.toNestedPicks(), [[], [], 123]);
    });
    it("handles empty spans anywhere", () => {
      const playout = new Playout([7, 8], [0, 0, 0], [2, 0, 1]);
      assertEquals(playout.toNestedPicks(), [[[], [7], 8]]);
    });
    it("returns a value for any possible playout", () => {
      repeatTest(nestedPicks(), (p) => {
        const playout = picksToPlayout(p);
        try {
          playout.toNestedPicks();
        } catch (e) {
          console.log("playout:", playout);
          throw e;
        }
      });
    });
    it("round-trips with picksToPlayout when there are no empty spans", () => {
      repeatTest(nestedPicks({ minSpanSize: 1 }), (p) => {
        const playout = picksToPlayout(p);
        assertEquals(playout.toNestedPicks(), p);
      });
    });
  });
});

describe("PlayoutLog", () => {
  describe("getPlayout", () => {
    const req = new PickRequest(1, 6);

    it("returns an empty array when there are no spans", () => {
      assertEquals(new PlayoutLog().toPlayout().toNestedPicks(), []);
    });

    it("ignores an empty span", () => {
      const log = new PlayoutLog();
      log.startSpan();
      log.endSpan();
      assertEquals(log.toPlayout().toNestedPicks(), []);
    });

    it("ignores a single-pick span", () => {
      const log = new PlayoutLog();
      log.startSpan();
      log.pushPick(req, 1);
      log.endSpan();
      assertEquals(log.toPlayout().toNestedPicks(), [1]);
    });

    it("ignores a span that contains only a single span", () => {
      const log = new PlayoutLog();
      log.startSpan();
      log.startSpan();
      log.pushPick(req, 1);
      log.pushPick(req, 2);
      log.endSpan();
      log.endSpan();
      assertEquals(log.toPlayout().toNestedPicks(), [[1, 2]]);
    });
  });
});

function validRequest(
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

function recordPicks(out: PlayoutBuffer, input: NestedPicks) {
  const cursor = out.record();
  function walk(input: NestedPicks) {
    for (const item of input) {
      if (typeof item === "number") {
        const req = new PickRequest(item, item);
        cursor.pick(req);
      } else {
        cursor.startSpan();
        walk(item);
        cursor.endSpan();
      }
    }
  }
  walk(input);
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

    it("round trips any nested picks with spans at least 2", () => {
      repeatTest(nestedPicks({ minSpanSize: 2 }), (input) => {
        const stack = new PlayoutBuffer(alwaysPickDefault);
        recordPicks(stack, input);
        const playout = stack.endPlayout();
        assert(playout !== undefined);
        assertEquals(playout.toNestedPicks(), input);
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
    it("returns null when there are no picks", () => {
      const stack = new PlayoutBuffer(alwaysPickDefault);
      assertEquals(null, stack.playNext());
    });

    const one = new PickRequest(1, 1);

    it("returns null when it can't increment a single pick", () => {
      const stack = new PlayoutBuffer(alwaysPickDefault);
      assertEquals(stack.record().pick(one), 1);
      assertEquals(null, stack.playNext());
    });

    const bit = new PickRequest(0, 1);

    it("increments a single pick", () => {
      const stack = new PlayoutBuffer(alwaysPickDefault);
      assertEquals(stack.record().pick(bit), 0);
      const play = stack.playNext();
      assert(play !== null);
      assertEquals(play.pick(bit), 1);
      assertEquals(null, stack.playNext());
    });

    it("wraps around for a single pick", () => {
      const stack = new PlayoutBuffer(alwaysPick(1));
      assertEquals(stack.record().pick(bit), 1);
      const play = stack.playNext();
      assert(play !== null);
      assertEquals(play.pick(bit), 0);
      assertEquals(null, stack.playNext());
    });

    it("pops a pick when it can't increment it", () => {
      const stack = new PlayoutBuffer(alwaysPickDefault);
      const record = stack.record();
      assertEquals(record.pick(bit), 0);
      assertEquals(record.pick(one), 1);
      const play = stack.playNext();
      assert(play !== null);
      assertEquals(stack.length, 1);
      assertEquals(play.pick(bit), 1);
      assertEquals(null, stack.playNext());
    });

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
        assertFalse(
          result.has(key),
          `already saw ${key} (after ${result.size} replays)`,
        );
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
