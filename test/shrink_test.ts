import type { Domain } from "@/domain.ts";
import type { SystemConsole } from "@/runner.ts";
import type { StepKey } from "../src/edits.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";
import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { minMaxVal } from "./lib/ranges.ts";

import { PickRequest } from "../src/picks.ts";
import { Script } from "../src/script_class.ts";
import { Gen } from "@/arbitrary.ts";
import { CountingTestConsole } from "../src/console.ts";

import { shrink, Shrinker } from "../src/shrink.ts";
import { generate } from "../src/gen_class.ts";
import { randomPicker } from "../src/random.ts";
import { onePlayout } from "../src/backtracking.ts";
import { filtered } from "../src/results.ts";

function assertShrinks<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  seed: T,
  result: T,
  console?: SystemConsole,
) {
  console = console ?? new CountingTestConsole();
  const gen = dom.regenerate(seed);
  if (!gen.ok) {
    fail(`couldn't regenerate the starting value: ${gen.message}`);
  }

  const smaller = shrink(gen, interesting, console);
  assert(smaller, "didn't find the expected smaller value");
  assertEquals(smaller.val, result);
}

function assertNoChange<T>(
  dom: Domain<T>,
  interesting: (arg: T) => boolean,
  start: T,
  console?: SystemConsole,
) {
  assertShrinks(dom, interesting, start, start, console);
}

function seedFrom(reqs: PickRequest[], replies: number[]): Gen<number[]> {
  const build = Script.make("seedFrom", (pick) => {
    const out: number[] = [];
    for (const req of reqs) {
      out.push(pick(req));
    }
    return out;
  });
  return Gen.mustBuild(build, replies);
}

const emptySeed = seedFrom([], []);

const acceptAll = () => true;

const bitReq = new PickRequest(0, 1);
const roll = new PickRequest(1, 6);

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

  describe("for an int32", () => {
    it("shrinks to a positive number", () => {
      assertShrinks(dom.int32(), (n) => n >= 10, 12345, 10);
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

  describe("for a sequence of options", () => {
    const bits = arb.array(arb.int(0, 1), { length: { min: 1, max: 100 } });

    it("removes any sequence of options", () => {
      repeatTest(bits, (bits) => {
        const seed = seedFrom(bits.map(() => bitReq), bits);
        const gen = shrink(seed, acceptAll);
        assert(gen !== undefined);
        assertEquals(gen.picks.trimmed().replies, []);
      });
    });

    it("removes everything except one option", () => {
      const input = arb.from((pick) => {
        const prefix = pick(bits);
        const suffix = pick(bits);
        return { prefix, suffix };
      });
      repeatTest(input, ({ prefix, suffix }) => {
        const val = prefix.concat([1]).concat(suffix);
        const seed = seedFrom(val.map((_) => bitReq), val);
        const gen = shrink(seed, (arr) => arr.at(prefix.length) === 1);
        assert(gen !== undefined);
        const expected = Array(prefix.length).fill(0).concat(1);
        assertEquals(gen.picks.trimmed().replies, expected);
      });
    });
  });

  describe("for a mult-step build script", () => {
    const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

    const twoBits = bit.then("twoBits", (a, pick) => {
      const b = pick(PickRequest.bit);
      return [a, b];
    });

    it("can't shrink the default value", () => {
      const seed = Gen.mustBuild(twoBits, [0, 0]);
      const gen = shrink(seed, acceptAll);
      assertEquals(gen.val, [0, 0]);
    });

    it("can shrink both bits to zero", () => {
      const seed = Gen.mustBuild(twoBits, [1, 1]);
      const gen = shrink(seed, acceptAll);
      assertEquals(gen.val, [0, 0]);
    });
  });

  function includesSubarray<T>(array: T[], subarray: T[]): boolean {
    return array.some((_, i) =>
      subarray.every((val, j) => val === array[i + j])
    );
  }

  describe("for an array of ints", () => {
    it("removes leading and trailing unused elements", () => {
      const hay = arb.array(arb.int(1, 5), { length: { max: 10 } });
      const example = arb.from((pick) => {
        const prefix = pick(hay);
        const suffix = pick(hay);
        const needleSize = pick(arb.int(1, 3));
        const needle = Array(needleSize).fill(6);
        return { prefix, needle, suffix };
      });
      repeatTest(example, ({ prefix, needle, suffix }) => {
        const input = prefix.concat(needle).concat(suffix);
        assertShrinks(
          dom.array(dom.int(1, 6)),
          (a) => includesSubarray(a, needle),
          input,
          needle,
        );
      }, { reps: 100 });
    });
  });

  describe("for an array of strings", () => {
    it("removes all strings in an array", () => {
      const input = arb.array(arb.string(), { length: { min: 1, max: 5 } });
      repeatTest(input, (arr) => {
        assertShrinks(dom.array(dom.string()), acceptAll, arr, []);
      });
    });

    it("removes leading and trailing unused elements", () => {
      const hayString = arb.string({ length: { max: 2 } });
      const hay = arb.array(hayString, { length: { max: 10 } });
      const example = arb.from((pick) => {
        const prefix = pick(hay);
        const suffix = pick(hay);
        const needleSize = pick(arb.int(1, 3));
        const needle = Array(needleSize).fill("<->");
        return { prefix, needle, suffix };
      });
      repeatTest(example, ({ prefix, needle, suffix }) => {
        const input = prefix.concat(needle).concat(suffix);
        assert(!includesSubarray(prefix, needle));
        assertShrinks(
          dom.array(dom.string()),
          (a) => includesSubarray(a, needle),
          input,
          needle,
        );
      }, { reps: 100 });
    });

    function repeatString(s: string, n: number): string {
      let res = "";
      for (let i = 0; i < n; i++) {
        res += s;
      }
      return res;
    }

    it("shrinks each string to a given size", () => {
      const input = arb.array(arb.string({ length: 20 }), { length: 10 });
      const seed = generate(input, onePlayout(randomPicker(123)));
      assert(seed !== filtered);
      const gen = shrink(seed, () => true);
      const expectedItem = repeatString("a", 20);
      assertEquals(gen.val, Array(10).fill(expectedItem));
    });
  });

  describe("for a filtered string", () => {
    const filtered = dom.string().filter((s) =>
      s.length > 0 && !s.startsWith("a")
    );
    it("can't shrink a default value", () => {
      assertNoChange(filtered, () => true, "b");
    });
    it("shrinks non-default values", () => {
      repeatTest(filtered.filter((s) => s !== "b"), (suffix, console) => {
        assertShrinks(filtered, () => true, suffix, "b", console);
      }, { reps: 100 });
    });
  });

  describe("for a record", () => {
    it("can't shrink an empty record", () => {
      assertNoChange(dom.record({}), () => true, {});
    });
    const pair = dom.record({ a: dom.int32(), b: dom.string() });
    it("can't shrink when there's no alternative", () => {
      repeatTest(pair, ({ a, b }) => {
        assertNoChange(
          pair,
          (r) => r.a === a && r.b === b,
          { a, b },
        );
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

describe("Shrinker", () => {
  describe("shrinkTail", () => {
    function shrinkTail<T>(
      seed: Gen<T>,
      test: (val: T) => boolean,
    ): Gen<T> | undefined {
      const s = new Shrinker(seed, test);
      return s.shrinkTails() ? s.seed.gen : undefined;
    }

    it("can't shrink an empty seed", () => {
      assertEquals(shrinkTail(emptySeed, acceptAll), undefined);
    });

    it("shrinks a pipeline", () => {
      const script = arb.string().buildScript.then(
        "mapped string",
        (a) => a.concat("!"),
      );

      const seed = Gen.mustBuild(script, [1, 0, 0]);
      assertEquals(seed.val, "a!");

      const gen = shrinkTail(seed, acceptAll);
      assert(gen !== undefined);
      assertEquals(gen.val, "!");
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
        assertEquals(gen.picks.trimmed().replies, []);
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

    it("shrinks strings using split calls", () => {
      const rec = arb.record({
        a: arb.string(),
        b: arb.string(),
      });
      assert(Script.from(rec).splitCalls);
      const seed = Gen.mustBuild(rec, [1, 3, 1, 3, 0, 1, 3, 1, 3, 0]);
      assertEquals(seed.val, { a: "dd", b: "dd" });
      assertEquals(seed.stepKeys, [0, 1]);

      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkTails());
      const gen = s.seed.gen;
      assertEquals(gen.val, { a: "", b: "" });
      assertEquals(gen.replies, [0, 0]);
    });
  });

  describe("shrinkAllOptions", () => {
    function shrinkAllOptions<T>(seed: Gen<T>, test: (val: T) => boolean) {
      const s = new Shrinker(seed, test);
      return s.shrinkAllOptions() ? s.seed.gen : undefined;
    }

    it("can't shrink an empty seed", () => {
      assertEquals(shrinkAllOptions(emptySeed, acceptAll), undefined);
    });

    it("removes an option by with a value", () => {
      const seed = seedFrom([bitReq, roll], [1, 6]);

      const gen = shrinkAllOptions(seed, acceptAll);
      assert(gen !== undefined);
      assertEquals(gen.picks.trimmed().replies, []);
    });

    it("removes two options", () => {
      const seed = seedFrom(
        [roll, bitReq, roll, bitReq, roll, bitReq, roll],
        [6, 1, 6, 1, 3, 1, 5],
      );
      const gen = shrinkAllOptions(seed, acceptAll);
      assert(gen !== undefined);
      assertEquals(gen.picks.trimmed().replies, [6]);
    });

    it("removes unused leading characters", () => {
      const seed = dom.string().regenerate("abc");
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s.includes("c"));
      assert(gen !== undefined);
      assertEquals(gen.val, "c");
    });

    it("removes trailing strings in an array", () => {
      const seed = dom.array(dom.string()).regenerate(["a", "b", "c"]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s.includes("a"));
      assert(gen !== undefined, "didn't shrink");
      assertEquals(gen.val, ["a"]);
    });

    it("removes leading strings in an array", () => {
      const seed = dom.array(dom.string()).regenerate(["a", "b", "c"]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s.includes("c"));
      assert(gen !== undefined, "didn't shrink");
      assertEquals(gen.val, ["c"]);
    });

    it("shrinks strings in an array", () => {
      const seed = dom.array(dom.string()).regenerate(["a", "b", "c"]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s.length === 3);
      assert(gen !== undefined, "didn't shrink");
      assertEquals(gen.val, ["", "", ""]);
    });
  });

  describe("shrinkAllPicks", () => {
    function shrinkAllPicks<T>(
      seed: Gen<T>,
      test: (val: T) => boolean,
      console?: SystemConsole,
    ) {
      const s = new Shrinker(seed, test, console);
      return s.shrinkAllPicks() ? s.seed.gen : undefined;
    }

    it("can't shrink an empty seed", () => {
      assertEquals(shrinkAllPicks(emptySeed, acceptAll), undefined);
    });

    it("shrinks to default picks", () => {
      const lo = new PickRequest(1, 2);
      const hi = new PickRequest(3, 4);
      const seed = seedFrom([lo, hi], [2, 4]);
      const gen = shrinkAllPicks(seed, acceptAll);
      assertEquals(gen?.replies, [1, 3]);
    });

    it("shrinks a pipeline", () => {
      const bit = Script.make("bit", (pick) => pick(PickRequest.bit));
      const twoBits = bit.then(
        "two bits",
        (a, pick) => [a, pick(PickRequest.bit)],
      );

      const seed = Gen.mustBuild(twoBits, [1, 1]);
      const gen = shrinkAllPicks(seed, acceptAll);
      assertEquals(gen?.replies, [0, 0]);
    });

    it("shrinks strings using split calls", () => {
      const rec = arb.record({
        a: arb.string(),
        b: arb.string(),
      });
      assert(Script.from(rec).splitCalls);
      const seed = Gen.mustBuild(rec, [1, 3, 1, 3, 0, 1, 3, 1, 3, 0]);
      assertEquals(seed.val, { a: "dd", b: "dd" });
      assertEquals(seed.stepKeys, [0, 1]);

      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkAllPicks());
      const gen = s.seed.gen;
      assertEquals(gen.replies, [0, 0]);
      assertEquals(gen.val, { a: "", b: "" });
    });
  });

  describe("shrinkOnePick", () => {
    function shrinkOnePick<T>(
      key: StepKey,
      offset: number,
      seed: Gen<T>,
      test: (val: T) => boolean,
    ) {
      const s = new Shrinker(seed, test);
      return s.shrinkOnePick(key, offset) ? s.seed.gen : undefined;
    }

    it("can't shrink an empty seed", () => {
      assertEquals(shrinkOnePick(0, 0, emptySeed, acceptAll), undefined);
    });

    const roll = new PickRequest(1, 6);
    it("can't shrink a pick already at the minimum", () => {
      const seed = seedFrom([roll], [1]);
      assertEquals(shrinkOnePick(0, 0, seed, acceptAll), undefined);
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
        const gen = shrinkOnePick(0, prefix.length, seed, acceptAll);
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
        const gen = shrinkOnePick(0, 0, seed, accept);
        assertEquals(gen?.replies, [want]);
      });
    });
  });
});
