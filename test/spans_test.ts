import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";

import { NestedPicks, nestedPicks, SpanLog } from "../src/spans.ts";
import { PlayoutSearch } from "../src/searches.ts";

type NestedPickOpts = {
  minSpanSize?: number;
  maxSpanSize?: number;
  maxDepth?: number;
};

function genNestedPicks(opts?: NestedPickOpts): Arbitrary<NestedPicks> {
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

function roundTrip(input: NestedPicks) {
  const picks: number[] = [];
  const starts: number[] = [];
  const ends: number[] = [];

  function walk(input: NestedPicks) {
    for (const item of input) {
      if (typeof item === "number") {
        picks.push(item);
      } else {
        const span = starts.length;
        starts.push(picks.length);
        ends.push(NaN);
        walk(item);
        ends[span] = picks.length;
      }
    }
  }
  walk(input);
  return nestedPicks(picks, { starts, ends });
}

describe("nestedPicks", () => {
  it("returns an empty list when there are no picks or spans", () => {
    assertEquals(nestedPicks([], { starts: [], ends: [] }), []);
  });
  it("returns a list of picks when there are only picks", () => {
    assertEquals(nestedPicks([1, 2, 3], { starts: [], ends: [] }), [1, 2, 3]);
  });
  it("interprets empty spans as sequential", () => {
    // This is ambigous. It could also be [[]].
    // But PlayoutContext shouldn't be emitting empty spans anyway.
    const starts = [0, 0];
    const ends = [0, 0];
    assertEquals(nestedPicks([], { starts, ends }), [[], []]);
  });
  it("puts the pick first", () => {
    const starts = [1, 1];
    const ends = [1, 1];
    assertEquals(nestedPicks([123], { starts, ends }), [123, [], []]);
  });
  it("puts the pick in the middle", () => {
    const starts = [0, 0];
    const ends = [1, 1];
    assertEquals(nestedPicks([123], { starts, ends }), [[[123]]]);
  });
  it("puts the pick last", () => {
    const starts = [0, 0];
    const ends = [0, 0];
    assertEquals(nestedPicks([123], { starts, ends }), [[], [], 123]);
  });
  it("handles empty spans anywhere", () => {
    const starts = [0, 0, 0];
    const ends = [2, 0, 1];
    assertEquals(nestedPicks([7, 8], { starts, ends }), [[[], [7], 8]]);
  });
  it("returns a value for any possible playout", () => {
    repeatTest(genNestedPicks(), (p) => {
      roundTrip(p);
    });
  });
  it("round-trips when there are no empty spans", () => {
    repeatTest(genNestedPicks({ minSpanSize: 1 }), (p) => {
      assertEquals(roundTrip(p), p);
    });
  });
});

describe("SpanLog", () => {
  let search = new PlayoutSearch();
  let log = new SpanLog(search);

  beforeEach(() => {
    search = new PlayoutSearch();
    assert(search.startAt(0));
    log = new SpanLog(search);
  });

  function checkNestedPicks(expected: NestedPicks) {
    const nested = nestedPicks(search.getPicks().replies(), log.getSpans());
    assertEquals(nested, expected);
  }

  it("returns an empty array when there are no spans", () => {
    checkNestedPicks([]);
  });

  it("ignores an empty span", () => {
    log.startSpan();
    log.endSpan(1);
    checkNestedPicks([]);
  });

  const req = new PickRequest(1, 6);

  it("ignores a single-pick span", () => {
    log.startSpan();
    search.maybePick(req);
    log.endSpan(1);
    checkNestedPicks([1]);
  });

  it("ignores a span that contains only a single subspan", () => {
    log.startSpan();
    log.startSpan();
    search.maybePick(req);
    search.maybePick(req);
    log.endSpan(2);
    log.endSpan(1);
    checkNestedPicks([[1, 1]]);
  });

  describe("cancelSpan", () => {
    it("throws an error when there are no spans", () => {
      assertThrows(() => log.cancelSpan(0), Error);
    });
    it("throws an error when the level doesn't match startSpan", () => {
      log.startSpan();
      log.endSpan(1);
      assertThrows(() => log.cancelSpan(0), Error);
      assertThrows(() => log.cancelSpan(2), Error);
    });
  });
});
