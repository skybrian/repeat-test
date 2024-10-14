import type { BuildFunction, Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  assertFirstGenerated,
  assertFirstValues,
  assertGenerated,
  assertValues,
} from "./lib/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { Filtered } from "../src/pickable.ts";
import { PickRequest } from "../src/picks.ts";

import { Arbitrary } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

const bit = new PickRequest(0, 1);

describe("Arbitrary", () => {
  describe("from", () => {
    describe("given a PickRequest", () => {
      it("generates both values", () => {
        const arb = Arbitrary.from(bit);
        assertEquals("0..1", arb.name);
        assertValues(arb, [0, 1]);
      });
    });
    describe("given a Pickable", () => {
      const answer: Pickable<string> = {
        buildFrom: (pick) => {
          return pick(bit) == 1 ? "yes" : "no";
        },
      };
      it("generates both values", () => {
        const arb = Arbitrary.from(answer);
        assertEquals(arb.name, "untitled");
        assertValues(arb, ["no", "yes"]);
      });
    });
    describe("given a build function", () => {
      it("throws if given a callback that throws", () => {
        const build = () => {
          throw new Error("oops");
        };
        assertThrows(() => Arbitrary.from(build), Error, "oops");
      });
      it("throws an Error if the Arbitrary didn't generate any values", () => {
        const build = () => {
          throw new Filtered("oops");
        };
        assertThrows(
          () => Arbitrary.from(build),
          Error,
          "can't create Arbitrary for 'untitled' because no randomly-generated values were accepted",
        );
      });
      it("throws an Error if given a callback that calls pick incorrectly", () => {
        type Pick = (arg: unknown) => number;
        const build = ((pick: Pick) => pick("hello")) as BuildFunction<
          number
        >;
        assertThrows(
          () => Arbitrary.from(build),
          Error,
          "pick function called with an invalid argument",
        );
      });
    });
  });

  describe("of", () => {
    it("throws if called with no arguments", () => {
      assertThrows(
        () => Arbitrary.of(),
        Error,
        "Arbitrary.of() requires at least one argument",
      );
    });
    it("throws if passes a non-frozen object", () => {
      assertThrows(
        () => Arbitrary.of({}),
        Error,
        "Arbitrary.of() requires frozen objects",
      );
    });
    it("returns a constant Arbitrary if called with one argument", () => {
      const arb = Arbitrary.of("hi");
      assertGenerated(arb, [{ val: "hi", picks: [] }]);
      assertEquals(arb.maxSize, 1);
    });
    it("creates an Arbitrary with multiple arguments", () => {
      const arb = Arbitrary.of("hi", "there");
      assertGenerated(arb, [
        { val: "hi", picks: [0] },
        { val: "there", picks: [1] },
      ]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("oneOf", () => {
    it("throws if given an empty array", () => {
      assertThrows(
        () => Arbitrary.oneOf(),
        Error,
        "Arbitrary.oneOf() requires at least one alternative",
      );
    });
    it("accepts constant alteratives", () => {
      const arb = Arbitrary.oneOf(Arbitrary.of(1), Arbitrary.of(2));
      assertGenerated(arb, [{ val: 1, picks: [0] }, { val: 2, picks: [1] }]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("record", () => {
    it("accepts a constant record shape", () => {
      const arb = Arbitrary.record({ a: Arbitrary.of(1), b: Arbitrary.of(2) });
      assertGenerated(arb, [{ val: { a: 1, b: 2 }, picks: [] }]);
      assertEquals(arb.maxSize, 1);
    });
    it("has a default name", () => {
      assertEquals(Arbitrary.record({}).name, "empty record");
      assertEquals(Arbitrary.record({ a: Arbitrary.of(1) }).name, "record");
    });
    describe("for a pair", () => {
      const pair = Arbitrary.record({ a: arb.int32(), b: arb.string() });
      it("sometimes has non-default values", () => {
        repeatTest(pair, ({ a, b }, console) => {
          console.sometimes(
            "a and b are both non-default values",
            a !== 0 && b !== "",
          );
        });
      });
    });
  });

  describe("filter", () => {
    const sixSided = Arbitrary.from(new PickRequest(1, 6)).with({
      name: "sixSided",
    });

    it("disallows filters that don't allow any values through", () => {
      const rejectEverything = () => false;
      assertThrows(
        () => arb.string().filter(rejectEverything),
        Error,
        "string filter didn't allow enough values through; want: 2 of 50, got: 0",
      );
    });
    it("keeps the default the same if it works", () => {
      const keepEverything = () => true;
      const filtered = sixSided.filter(keepEverything);
      assertValues(filtered, [1, 2, 3, 4, 5, 6]);
    });
    it("changes the default to the next value that satisfies the predicate", () => {
      const keepEvens = (n: number) => n % 2 === 0;
      const filtered = sixSided.filter(keepEvens);
      assertValues(filtered, [2, 4, 6]);
    });
    it("finds a default in the first field of a record", () => {
      const rec = Arbitrary.record({
        a: Arbitrary.of(1, 2),
        b: arb.array(arb.boolean()),
      });
      const filtered = rec.filter((r) => r.a === 2);
      assertFirstValues(filtered, [
        { b: [], a: 2 },
        { b: [false], a: 2 },
        { b: [true], a: 2 },
        { b: [false, false], a: 2 },
      ]);
    });
    it("filters out values that don't satisfy the predicate", () => {
      const not3 = sixSided.filter((n) => n !== 3);
      repeatTest(not3, (n) => {
        assert(n !== 3, `want: not 3, got ${n}`);
      });
    });
    it("filters an arbitrary created from multiple picks", () => {
      const bit = new PickRequest(0, 1);
      const bitCount = 2;
      const accepted = new Set(["[0,1]", "[1,0]"]);

      const combos = Arbitrary.from((pick) => {
        const picks: number[] = [];
        for (let i = 0; i < bitCount; i++) {
          picks.push(pick(bit));
        }
        return JSON.stringify(picks);
      });
      const filtered = combos.filter(
        (pick) => accepted.has(pick),
      );
      assertValues(filtered, ["[1,0]", "[0,1]"]);
    });
    it("works when a filter is embedded in another filter", () => {
      const example = Arbitrary.from((pick) => {
        const fiveSided = Arbitrary.from((pick) =>
          pick(sixSided.filter((n) => n !== 5))
        );
        const excluded = pick(fiveSided);
        const filtered = fiveSided.filter((n) => n !== excluded);
        const other = pick(filtered);
        return { excluded, other };
      });
      repeatTest(example, ({ excluded, other }) => {
        assert(excluded >= 1 && excluded <= 6, `want: 1-6, got ${excluded}}`);
        assert(other !== excluded, `want: not ${excluded}`);
      });
    });
    it("has a name by default", () => {
      const original = Arbitrary.of(1, 2, 3);
      const filtered = original.filter(
        (n) => n === 2,
      );
      assertEquals(filtered.name, "3 examples (filtered)");
    });
    it("doesn't add (filtered) twice to the name", () => {
      const original = Arbitrary.of(1, 2, 3);
      const filtered = original.filter(
        (n) => n > 1,
      ).filter((n) => n === 2);
      assertEquals(filtered.name, "3 examples (filtered)");
    });
    it("recovers cleanly when the filtered arbitrary throws Pruned", () => {
      const original = Arbitrary.from((pick) => {
        const n = pick(new PickRequest(1, 3));
        if (n === 2) throw new Filtered("skip 2");
        return n;
      });
      const filtered = original.filter(() => true);
      assertValues(filtered, [1, 3]);
    });
    describe("for a filtered pair", () => {
      const pair = Arbitrary.record({ a: arb.int32(), b: arb.string() });
      const filtered = pair.filter((r) => r.a !== 0 && r.b !== "");
      it("always has non-default values", () => {
        repeatTest(filtered, ({ a, b }) => {
          assert(a !== 0, `want: not 0, got ${a}`);
          assert(b !== "", `want: not empty, got ${b}`);
        });
      });
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      assertFirstGenerated(original, [{ val: 1, picks: [1] }]);

      const mapped = original.map((n) => n * 2);
      assertFirstGenerated(mapped, [{ val: 2, picks: [1] }]);
    });
    it("has a name by default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      const mapped = original.map((n) => n * 2);
      assertEquals(mapped.name, "map");
    });
  });

  describe("chain", () => {
    it("has a name by default", () => {
      const hello = Arbitrary.from(() => "hello");
      const world = hello.chain(() => Arbitrary.from(() => "world"));
      assertEquals(world.name, "chain");
    });
  });

  describe("maxSize", () => {
    describe("when the Arbitrary is based on a PickRequest", () => {
      it("returns the size of of the PickRequest", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
        assertEquals(oneTwoThree.maxSize, 3);
      });
      it("returns same size after mapping", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3)).map((n) =>
          n + 1
        );
        assertEquals(oneTwoThree.maxSize, 3);
      });
      it("returns same size after filtering", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3)).filter(
          (n) => n % 2 == 0,
        );
        assertEquals(oneTwoThree.maxSize, 3);
      });
    });
    describe("when the Arbitrary is based on a constant", () => {
      it("returns 1", () => {
        assertEquals(Arbitrary.of("hi").maxSize, 1);
      });
      it("returns 1 after mapping", () => {
        assertEquals(Arbitrary.of("hi").map((s) => s + " there").maxSize, 1);
      });
      it("returns 1 after filtering", () => {
        assertEquals(Arbitrary.of("hi").filter((s) => s == "hi").maxSize, 1);
      });
    });
  });

  describe("buildPick", () => {
    it("works in a build script", () => {
      // Verbose, but valid.
      const zero = arb.from((pick) => Arbitrary.of(0).buildFrom(pick));
      repeatTest(zero, (val) => {
        assertEquals(val, 0);
      });
    });
  });

  describe("toString", () => {
    it("returns a string with the name", () => {
      const original = Arbitrary.of(1, 2, 3);
      assertEquals(original.toString(), "Arbitrary('3 examples')");
    });
  });
});
