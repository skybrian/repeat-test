import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import type { Domain } from "@/domain.ts";
import * as dom from "@/doms.ts";

import { minMaxVal } from "./lib/ranges.ts";

import { PickRequest } from "../src/picks.ts";
import {
  shrink,
  shrinkAllOptions,
  shrinkAllPicks,
  shrinkOnePick,
  shrinkTail,
} from "../src/shrink.ts";
import type { PickSet } from "../src/generated.ts";
import { Generated } from "@/arbitrary.ts";

function assertShrinks<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
  result: T,
) {
  const gen = dom.regenerate(start);
  if (!gen.ok) {
    fail(`couldn't regenerate the starting value: ${gen.message}`);
  }

  const smaller = shrink(gen, interesting);
  assert(smaller, "didn't find the expected smaller value");
  assertEquals(smaller.val, result);
}

function assertNoChange<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
) {
  assertShrinks(dom, interesting, start, start);
}

describe("shrink", () => {
  describe("for an int", () => {
    it("can't shrink the minimum value", () => {
      assertNoChange(dom.int(1, 6), () => true, 1);
    });
    it("can't shrink when the value is required", () => {
      repeatTest(minMaxVal(), ({ min, max, val }) => {
        assertNoChange(dom.int(min, max), (n) => n === val, val);
      });
    });
    it("shrinks an unused positive int to the minimum", () => {
      assertShrinks(dom.int(1, 6), () => true, 6, 1);
    });
    it("shrinks an unused negative int to the maximum", () => {
      assertShrinks(dom.int(-6, -1), () => true, -6, -1);
    });
    it("shrinks as far as possible for an inequality", () => {
      assertShrinks(dom.int(1, 6), (n) => n >= 3, 6, 3);
    });
  });
  describe("for an ascii character", () => {
    it("can't shrink 'a'", () => {
      assertNoChange(dom.asciiChar(), () => true, "a");
    });
    it("can't shrink when all characters are used", () => {
      repeatTest(arb.asciiChar(), (start) => {
        assertNoChange(dom.asciiChar(), (c) => c === start, start);
      });
    });
    it("shrinks an unused character to 'a'", () => {
      assertShrinks(dom.asciiChar(), () => true, "Z", "a");
    });
    it("shrinks a used character to a lower one that works", () => {
      assertShrinks(dom.asciiChar(), (s) => /[A-Z]/.test(s), "Z", "A");
    });
  });
  describe("for a string", () => {
    it("can't shrink an empty string", () => {
      assertNoChange(dom.string(), () => true, "");
    });
    it("can't shrink when there's no alternative", () => {
      repeatTest(arb.string(), (start) => {
        assertNoChange(dom.string(), (s) => s === start, start);
      }, { reps: 10 });
    });
    it("removes unused trailing characters", () => {
      assertShrinks(dom.string(), (s) => s.startsWith("a"), "abc", "a");
    });
    it("sets unused characters to 'a'", () => {
      assertShrinks(dom.string(), (s) => s.at(2) === "z", "xyz", "aaz");
    });
    it("removes unused leading characters", () => {
      assertShrinks(dom.string(), (s) => s.endsWith("z"), "xyz", "z");
    });
  });
  describe("for a record", () => {
    it("can't shrink an empty record", () => {
      assertNoChange(dom.record({}), () => true, {});
    });
    const pair = dom.record({ a: dom.int32(), b: dom.string() });
    it("can't shrink when there's no alternative", () => {
      repeatTest(pair, ({ a, b }) => {
        assertNoChange(pair, (r) => r.a === a && r.b === b, { a, b });
      }, { reps: 10 });
    });
    it("shrinks all fields to their minimums", () => {
      repeatTest(pair, (start) => {
        assertShrinks(pair, (_r) => true, start, { a: 0, b: "" });
      }, { reps: 100 });
    });
    it("shrinks the first field if the second is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.b === b, { a, b }, { a: 0, b });
      }, { reps: 10 });
    });
    it("shrinks the second field if the first is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.a === a, { a, b }, { a, b: "" });
      }, { reps: 100 });
    });
  });
});

function seedFrom(reqs: PickRequest[], replies: number[]): Generated<string> {
  const fakeSet: PickSet<string> = {
    label: "(fake)",
    generateFrom: (pick) => {
      for (const req of reqs) {
        pick(req);
      }
      return "ignored";
    },
  };
  return new Generated(fakeSet, reqs, replies, "ignored");
}

const emptySeed = seedFrom([], []);

const acceptAll = () => true;

describe("shrinkTail", () => {
  it("can't shrink an empty seed", () => {
    assertEquals(undefined, shrinkTail(emptySeed, acceptAll));
  });

  const nonEmptySeeds = arb.array(minMaxVal({ minMin: 0 }), {
    length: { max: 100 },
  }).filter((recs) => recs.some((r) => r.val !== r.min));

  it("shrinks random picks to nothing", () => {
    repeatTest(nonEmptySeeds, (recs) => {
      const reqs = recs.map((r) => new PickRequest(r.min, r.max));
      const replies = recs.map((r) => r.val);
      const seed = seedFrom(reqs, replies);

      const gen = shrinkTail(seed, acceptAll);
      assert(gen !== undefined, "expected a result from shrinkTail");
      assertEquals(gen.trimmedPlayout().replies, []);
    });
  });

  it("shrinks a string to a smaller length", () => {
    const example = arb.from((pick) => {
      const s = pick(arb.string({ length: { min: 1, max: 100 } }));
      const len = pick(arb.int(0, s.length - 1));
      return { s, len };
    });
    repeatTest(example, ({ s, len }) => {
      const seed = dom.string().regenerate(s);
      assert(seed.ok);
      const gen = shrinkTail(seed, (s) => s.length >= len);
      assert(gen !== undefined, "expected a result from shrinkTail");
      assertEquals(gen.val.length, len);
    });
  });
});

describe("shrinkOnePick", () => {
  it("can't shrink an empty seed", () => {
    assertEquals(undefined, shrinkOnePick(0)(emptySeed, acceptAll));
  });

  const roll = new PickRequest(1, 6);
  it("can't shrink a pick already at the minimum", () => {
    const seed = seedFrom([roll], [1]);
    assertEquals(undefined, shrinkOnePick(0)(seed, acceptAll));
  });

  it("shrinks a pick to the minimum", () => {
    const rolls = arb.array(arb.int(1, 6), { length: { max: 3 } });
    const example = arb.record({
      prefix: rolls,
      value: arb.int(2, 6),
      suffix: rolls,
    });
    repeatTest(example, ({ prefix, value, suffix }) => {
      const replies = [...prefix, value, ...suffix];
      const reqs = new Array(replies.length).fill(roll);
      const seed = seedFrom(reqs, replies);
      const gen = shrinkOnePick(prefix.length)(seed, acceptAll);
      assertEquals(gen?.replies, [...prefix, 1, ...suffix]);
    });
  });

  it("shrinks a pick to a given value", () => {
    const example = arb.from((pick) => {
      const want = pick(arb.int(1, 9));
      const start = pick(arb.int(want + 1, 10));
      return { start, want };
    });
    repeatTest(example, ({ start, want }) => {
      const seed = dom.int(1, 10).regenerate(start);
      assert(seed.ok);
      const accept = (v: number) => v >= want;
      const gen = shrinkOnePick(0)(seed, accept);
      assertEquals(gen?.replies, [want]);
    });
  });
});

describe("shrinkAllPicks", () => {
  it("can't shrink an empty seed", () => {
    assertEquals(undefined, shrinkAllPicks(emptySeed, acceptAll));
  });

  it("shrinks to default picks", () => {
    const lo = new PickRequest(1, 2);
    const hi = new PickRequest(3, 4);
    const seed = seedFrom([lo, hi], [2, 4]);
    const gen = shrinkAllPicks(seed, acceptAll);
    assertEquals(gen?.replies, [1, 3]);
  });
});

describe("shrinkAllOptions", () => {
  const bit = new PickRequest(0, 1);
  const roll = new PickRequest(1, 6);

  it("can't shrink an empty seed", () => {
    assertEquals(undefined, shrinkAllOptions(emptySeed, acceptAll));
  });

  it("removes an option by itself", () => {
    const seed = seedFrom([bit, roll], [1, 6]);

    const gen = shrinkAllOptions(seed, acceptAll);
    assert(gen !== undefined);
    assertEquals(gen.trimmedPlayout().replies, []);
  });

  it("removes two options", () => {
    const seed = seedFrom(
      [roll, bit, roll, bit, roll, bit, roll],
      [6, 1, 6, 1, 3, 1, 5],
    );
    const gen = shrinkAllOptions(seed, acceptAll);
    assert(gen !== undefined);
    assertEquals(gen.trimmedPlayout().replies, [6]);
  });

  it("removes unused leading characters", () => {
    const seed = dom.string().regenerate("abc");
    assert(seed.ok);
    const gen = shrinkAllOptions(seed, (s) => s.includes("c"));
    assert(gen !== undefined);
    assertEquals(gen.val, "c");
  });
});
