import type { Domain } from "@/domain.ts";
import type { SystemConsole } from "@/runner.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, fail } from "@std/assert";
import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { minMaxVal } from "./lib/ranges.ts";

import { PickList, PickRequest } from "../src/picks.ts";
import { Script } from "../src/script_class.ts";
import { scriptFrom } from "../src/scripts/scriptFrom.ts";
import { Gen } from "@/arbitrary.ts";
import { CountingTestConsole } from "../src/console.ts";

import { shrink, Shrinker } from "../src/shrink.ts";
import { generate, MutableGen } from "../src/gen_class.ts";
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

describe("Shrinker", () => {
  describe("removeGroups", () => {
    const rolls = Script.make("roll until one", (pick) => {
      const out: number[] = [];
      for (let r = pick(roll); r !== 1; r = pick(roll)) {
        out.push(r);
      }
      return out;
    }, { logCalls: true });

    it("can remove all the calls", () => {
      const seed = Gen.mustBuild(rolls, [6, 2, 3, 4, 5, 1]);
      const s = new Shrinker(seed, acceptAll);
      assert(s.removeGroups());
      assertEquals(s.seed.val, []);
    });

    it("can remove all but one call", () => {
      const seed = Gen.mustBuild(rolls, [6, 2, 3, 4, 5, 1]);
      repeatTest([2, 3, 4, 5, 6], (keeper) => {
        const s = new Shrinker(seed, (val) => val.includes(keeper));
        assert(s.removeGroups());
        assertEquals(s.seed.val, [keeper]);
      });
    });

    it("can remove an empty string", () => {
      const domain = dom.array(dom.string());
      const seed = domain.regenerate(["", "<->"]);
      assert(seed.ok);
      const s = new Shrinker(seed, (val) => val.includes("<->"));
      assert(s.removeGroups());
      assertEquals(s.seed.val, ["<->"]);
    });

    it("fails to remove a single group", () => {
      const domain = dom.array(dom.string());
      const seed = domain.regenerate(["keeper"]);
      assert(seed.ok);
      const s = new Shrinker(seed, (val) => val.includes("keeper"));
      assertFalse(s.removeGroups());
    });

    it("gives up after 100 tries", () => {
      const domain = dom.array(dom.string());
      const seed = domain.regenerate(Array(1000).fill("x"));
      assert(seed.ok);
      const s = new Shrinker(seed, (val) => val.length === 1000);
      assertFalse(s.removeGroups());
      assertEquals(s.seed.val, seed.val);
      assert(s.tries <= 100, `want <= 100 tries; got ${s.tries}`);
    });
  });

  describe("shrinkTails", () => {
    it("can't shrink an empty seed", () => {
      const s = new Shrinker(emptySeed, acceptAll);
      assertFalse(s.shrinkTails());
    });

    it("shrinks a script with logCalls turned on", () => {
      const script = Script.make("mapped string", (pick) => {
        const a = pick(arb.string());
        return a.concat("!");
      }, { logCalls: true });

      const seed = Gen.mustBuild(script, [1, 1, 1, 1, 0]);
      assertEquals(seed.val, "bb!");

      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkTails());
      assertEquals(s.seed.gen.val, "!");
    });

    const nonEmptySeeds = arb.array(minMaxVal({ minMin: 0, minSize: 2 }), {
      length: { min: 3, max: 100 },
    }).filter((recs) => recs.filter((r) => r.val > r.min).length > 2);

    it("shrinks random picks to nothing", () => {
      repeatTest(nonEmptySeeds, (recs) => {
        const reqs = recs.map((r) => new PickRequest(r.min, r.max));
        const replies = recs.map((r) => r.val);
        const seed = seedFrom(reqs, replies);

        const s = new Shrinker(seed, acceptAll);
        assert(s.shrinkTails());
        const picks = PickList.copyFrom(s.seed.gen);
        assertEquals(picks.trimmed().replies, []);
      });
    });

    it("shrinks a string to a smaller length", () => {
      const example = arb.from((pick) => {
        const str = pick(arb.string({ length: { min: 3, max: 100 } }));
        const len = pick(arb.int(0, str.length - 1));
        return { str, len };
      });
      repeatTest(example, ({ str, len }) => {
        // Put it in an array so it's not top-level.
        const seed = dom.array(dom.string()).regenerate([str]);
        assert(seed.ok);
        const s = new Shrinker(
          seed,
          (arr) => arr.length === 1 && arr[0].length >= len,
        );
        assert(s.shrinkTails());
        assertEquals(s.seed.gen.val[0].length, len);
      });
    });

    it("shrinks strings using split calls", () => {
      const rec = arb.object({
        a: arb.string(),
        b: arb.string(),
      });
      assert(scriptFrom(rec).opts.logCalls);
      const seed = Gen.mustBuild(rec, [1, 3, 1, 3, 0, 1, 3, 1, 3, 0]);
      assertEquals(seed.val, { a: "dd", b: "dd" });
      assertEquals(MutableGen.from(seed).groupKeys, [0, 1]);

      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkTails());
      const gen = s.seed.gen;
      assertEquals(gen.val, { a: "", b: "" });
      const picks = PickList.copyFrom(gen);
      assertEquals(picks.replies, [0, 0]);
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
      assertEquals(PickList.copyFrom(gen).trimmed().replies, []);
    });

    it("removes two options", () => {
      const seed = seedFrom(
        [roll, bitReq, roll, bitReq, roll, bitReq, roll],
        [6, 1, 6, 1, 3, 1, 5],
      );
      const gen = shrinkAllOptions(seed, acceptAll);
      assert(gen !== undefined);
      assertEquals(PickList.copyFrom(gen).trimmed().replies, [6]);
    });

    it("removes unused leading characters in a wrapped string", () => {
      const seed = dom.array(dom.string()).regenerate(["abc"]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s[0].includes("c"));
      assert(gen !== undefined);
      assertEquals(gen.val, ["c"]);
    });

    it("removes trailing strings in an array", () => {
      const seed = dom.array(dom.string()).regenerate(["a", "b", "c"]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s.includes("a"));
      assert(gen !== undefined, "didn't shrink");
      assertEquals(gen.val, ["a"]);
    });

    it("removes leading strings in an array", () => {
      const inner = dom.array(dom.string());
      // wrap to disable splitting
      const seed = dom.array(inner).regenerate([["a", "b", "c"]]);
      assert(seed.ok);
      const gen = shrinkAllOptions(seed, (s) => s[0].includes("c"));
      assert(gen !== undefined, "didn't shrink");
      assertEquals(gen.val, [["c"]]);
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
    it("can't shrink an empty seed", () => {
      const s = new Shrinker(emptySeed, acceptAll);
      assertEquals(s.shrinkAllPicks(), false);
    });

    it("shrinks to default picks", () => {
      const lo = new PickRequest(1, 2);
      const hi = new PickRequest(3, 4);
      const seed = seedFrom([lo, hi], [2, 4]);
      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkAllPicks());
      const picks = PickList.copyFrom(s.seed.gen);
      assertEquals(picks.replies, [1, 3]);
    });

    it("shrinks two picks", () => {
      const bit = Script.make("bit", (pick) => pick(PickRequest.bit));
      const twoBits = Script.make("two bits", (pick) => {
        const a = pick(bit);
        return [a, pick(PickRequest.bit)];
      }, { logCalls: true });

      const seed = Gen.mustBuild(twoBits, [1, 1]);
      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkAllPicks());
      const picks = PickList.copyFrom(s.seed.gen);
      assertEquals(picks.replies, [0, 0]);
    });

    it("fails to shrink a string with the expected number of picks", () => {
      const seed = dom.string().regenerate("abc");
      assert(seed.ok);
      const s = new Shrinker(seed, (s) => s === "abc");
      assertFalse(s.shrinkAllPicks());
      assertEquals(s.seed.val, "abc");
      assertEquals(s.tries, 5); // 6 - 1 (a is at minimum)
    });

    it("shrinks strings using split calls", () => {
      const rec = arb.object({
        a: arb.string(),
        b: arb.string(),
      });
      assert(scriptFrom(rec).opts.logCalls);
      const seed = Gen.mustBuild(rec, [1, 3, 1, 3, 0, 1, 3, 1, 3, 0]);
      assertEquals(seed.val, { a: "dd", b: "dd" });
      assertEquals(MutableGen.from(seed).groupKeys, [0, 1]);

      const s = new Shrinker(seed, acceptAll);
      assert(s.shrinkAllPicks());
      const gen = s.seed.gen;
      assertEquals(gen.val, { a: "", b: "" });
      const picks = PickList.copyFrom(gen);
      assertEquals(picks.replies, [0, 0]);
    });
  });

  describe("shrinkOnePick", () => {
    it("can't shrink an empty seed", () => {
      const s = new Shrinker(emptySeed, acceptAll);
      assertFalse(s.shrinkOnePick(0, 0));
    });

    const roll = new PickRequest(1, 6);
    it("can't shrink a pick already at the minimum", () => {
      const seed = seedFrom([roll], [1]);
      const s = new Shrinker(seed, acceptAll);
      assertFalse(s.shrinkOnePick(0, 0));
    });

    it("shrinks a pick to the minimum", () => {
      const rolls = arb.array(arb.int(1, 6), { length: { max: 3 } });
      const example = arb.object({
        prefix: rolls,
        value: arb.int(2, 6),
        suffix: rolls,
      });
      repeatTest(example, ({ prefix, value, suffix }) => {
        const replies = [...prefix, value, ...suffix];
        const reqs = new Array(replies.length).fill(roll);
        const seed = seedFrom(reqs, replies);
        const s = new Shrinker(seed, acceptAll);
        assert(s.shrinkOnePick(0, prefix.length));
        const picks = PickList.copyFrom(s.seed.gen);
        assertEquals(picks.replies, [...prefix, 1, ...suffix]);
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
        const s = new Shrinker(seed, accept);
        assert(s.shrinkOnePick(0, 0));
        assertEquals(PickList.copyFrom(s.seed.gen).replies, [want]);
      });
    });
  });
});

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
        assertEquals(PickList.copyFrom(gen).trimmed().replies, []);
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
        assertEquals(PickList.copyFrom(gen).trimmed().replies, expected);
      });
    });
  });

  describe("for a script with logCalls turned on", () => {
    const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

    const twoBits = Script.make("two bits", (pick) => {
      const a = pick(bit);
      return [a, pick(PickRequest.bit)];
    }, { logCalls: true });

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
      const hay = arb.array(arb.int(1, 5), { length: { max: 5 } });
      const example = arb.from((pick) => {
        const prefix = pick(hay);
        const suffix = pick(hay);
        const needleSize = pick(arb.int(1, 3));
        const needle = Array(needleSize).fill(6);
        return { prefix, needle, suffix };
      });
      repeatTest(example, ({ prefix, needle, suffix }, console) => {
        const input = prefix.concat(needle).concat(suffix);
        assertShrinks(
          dom.array(dom.int(1, 6)),
          (a) => includesSubarray(a, needle),
          input,
          needle,
          console,
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
      repeatTest(example, ({ prefix, needle, suffix }, console) => {
        const input = prefix.concat(needle).concat(suffix);
        assert(!includesSubarray(prefix, needle));
        assertShrinks(
          dom.array(dom.string()),
          (a) => includesSubarray(a, needle),
          input,
          needle,
          console,
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

  describe("for an object", () => {
    it("can't shrink an empty object", () => {
      assertNoChange(dom.object({}), () => true, {});
    });
    const pair = dom.object({ a: dom.int32(), b: dom.string() });
    it("can't shrink a pair when there's no alternative", () => {
      repeatTest(pair, ({ a, b }) => {
        assertNoChange(
          pair,
          (r) => r.a === a && r.b === b,
          { a, b },
        );
      }, { reps: 10 });
    });
    it("shrinks a pair to minimum values", () => {
      repeatTest(pair, (start) => {
        assertShrinks(pair, (_r) => true, start, { a: 0, b: "" });
      }, { reps: 100 });
    });
    it("shrinks the first property if the second is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.b === b, { a, b }, { a: 0, b });
      }, { reps: 10 });
    });
    it("shrinks the second property if the first is held constant", () => {
      repeatTest(pair, ({ a, b }) => {
        assertShrinks(pair, (r) => r.a === a, { a, b }, { a, b: "" });
      }, { reps: 100 });
    });
  });
});
