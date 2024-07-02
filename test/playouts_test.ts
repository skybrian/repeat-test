import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickDefault,
  alwaysPickMin,
  DepthFirstPicker,
  IntPicker,
  PickRequest,
  PickRequestOptions,
} from "../src/picks.ts";

import { randomPicker } from "../src/random.ts";

import {
  everyPlayout,
  NestedPicks,
  Playout,
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
  describe("toPlayout", () => {
    const req = new PickRequest(1, 6);

    it("returns an empty array when there are no spans", () => {
      const picker = new DepthFirstPicker();
      assertEquals(new PlayoutLog(picker).toPlayout().toNestedPicks(), []);
    });

    it("ignores an empty span", () => {
      const picker = new DepthFirstPicker();
      const log = new PlayoutLog(picker);
      log.startSpan();
      log.endSpan(1);
      assertEquals(log.toPlayout().toNestedPicks(), []);
    });

    it("ignores a single-pick span", () => {
      const picker = new DepthFirstPicker();
      const log = new PlayoutLog(picker);
      log.startSpan();
      log.pick(req);
      log.endSpan(1);
      assertEquals(log.toPlayout().toNestedPicks(), [1]);
    });

    it("ignores a span that contains only a single subspan", () => {
      const picker = new DepthFirstPicker();
      const log = new PlayoutLog(picker);
      log.startSpan();
      log.startSpan();
      log.pick(req);
      log.pick(req);
      log.endSpan(2);
      log.endSpan(1);
      assertEquals(log.toPlayout().toNestedPicks(), [[1, 1]]);
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

function collectPaths(
  picker: IntPicker,
  maze: (picker: IntPicker) => void,
  expectedCount: number,
) {
  const result = [];
  const seen = new Set();

  for (const ctx of everyPlayout(picker)) {
    if (result.length > expectedCount) {
      fail(`wanted ${expectedCount} playouts, got one more`);
    }

    maze(ctx);

    const picks = JSON.stringify(ctx.toPlayout().picks);
    if (seen.has(picks)) {
      fail(`duplicate playout: ${picks}`);
    }
    seen.add(picks);

    result.push(ctx.toPlayout().toNestedPicks());
  }
  return result;
}

function checkPaths(
  maze: (picker: IntPicker) => void,
  expected: NestedPicks[],
) {
  const playouts = collectPaths(alwaysPickDefault, maze, expected.length);
  assertEquals(playouts, expected);
}

describe("everyPlayout", () => {
  it("finds one path when there are choices", () => {
    checkPaths(() => {}, [[]]);
  });

  const justOne = new PickRequest(1, 1);
  it("finds one path for a one-way choice", () => {
    checkPaths((p) => {
      p.pick(justOne);
    }, [[1]]);
  });

  const bit = new PickRequest(0, 1);
  it("finds both paths for a two-way choice", () => {
    checkPaths((p) => {
      p.pick(bit);
    }, [[0], [1]]);
  });

  it("generates all alternatives for any single pick", () => {
    const validRequestAndReply = arb.from((pick) => {
      const req = pick(validRequest());
      const n = pick(req);
      return { req, n };
    });
    repeatTest(validRequestAndReply, ({ req, n }) => {
      let count = 0;
      for (const ctx of everyPlayout(alwaysPick(n))) {
        if (count > req.size) {
          fail(`wanted ${req.size} playouts, got one more`);
        }
        ctx.pick(req);
        count++;
      }
      assertEquals(count, req.size);
    });
  });

  it("backtracks to a previous choice", () => {
    checkPaths((p) => {
      p.pick(bit);
      p.pick(justOne);
    }, [[0, 1], [1, 1]]);
  });

  it("finds every combination for an odometer", () => {
    const digit = new PickRequest(0, 9);
    const digits = Array(3).fill(digit);

    const paths = collectPaths(alwaysPickMin, (p) => {
      digits.forEach((req) => p.pick(req));
    }, 1000);

    assertEquals(paths[0], [0, 0, 0]);
    assertEquals(paths[999], [9, 9, 9]);
    assertEquals(paths.length, 1000);
  });

  it("always chooses a path that hasn't been seen", () => {
    const randomMaze = arb.record({
      requests: arb.array(validRequest({ maxSize: 3 }), { max: 5 }),
      seed: arb.int32(),
    });
    repeatTest(randomMaze, ({ requests, seed }) => {
      collectPaths(randomPicker(seed), (p) => {
        for (const req of requests) {
          const n = p.pick(req);
          assert(n >= req.min);
          assert(n <= req.max);
        }
      }, 3 ** requests.length);
    });
  });
});
