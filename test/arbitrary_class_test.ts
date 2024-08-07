import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertFirstGenerated, assertGenerated } from "../src/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { Pruned } from "../src/backtracking.ts";
import { PickCallback, PickSet } from "../src/pick_function.ts";
import Arbitrary from "../src/arbitrary_class.ts";

const bit = new PickRequest(0, 1);

describe("Arbitrary", () => {
  describe("from", () => {
    describe("given a PickRequest", () => {
      it("generates both values", () => {
        const arb = Arbitrary.from(bit);
        assertEquals("0..1", arb.label);
        assertEquals(arb.takeAll(), [0, 1]);
      });
      it("accepts a custom label", () => {
        const arb = Arbitrary.from(bit, { label: "bit" });
        assertEquals(arb.label, "bit");
      });
    });
    describe("given a PickSet", () => {
      const answer: PickSet<string> = {
        label: "answer",
        generatePick: (pick) => {
          return pick(bit) == 1 ? "yes" : "no";
        },
      };
      it("generates both values", () => {
        const arb = Arbitrary.from(answer);
        assertEquals(arb.label, "answer");
        assertEquals(arb.takeAll(), ["no", "yes"]);
      });
      it("accepts a custom label", () => {
        const arb = Arbitrary.from(answer, { label: "yes/no" });
        assertEquals(arb.label, "yes/no");
      });
    });
    describe("given a callback", () => {
      it("throws if given a callback that throws", () => {
        const callback = () => {
          throw new Error("oops");
        };
        assertThrows(() => Arbitrary.from(callback), Error, "oops");
      });
      it("throws an Error if the Arbitrary didn't generate any values", () => {
        const callback = () => {
          throw new Pruned("oops");
        };
        assertThrows(
          () => Arbitrary.from(callback),
          Error,
          "(unlabeled) didn't generate any values",
        );
      });
      it("throws an Error if given a callback that calls pick incorrectly", () => {
        type Pick = (arg: unknown) => number;
        const callback = ((pick: Pick) => pick("hello")) as PickCallback<
          number
        >;
        assertThrows(
          () => Arbitrary.from(callback),
          Error,
          "pick function called with an invalid argument",
        );
      });
    });
    describe("given an array", () => {
      it("throws if given an empty array", () => {
        assertThrows(
          () => Arbitrary.from([]),
          Error,
          "Arbitrary.from() called with an empty array",
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
        () => Arbitrary.oneOf([]),
        Error,
        "Arbitrary.oneOf() requires at least one alternative",
      );
    });
    it("accepts constant alteratives", () => {
      const arb = Arbitrary.oneOf([Arbitrary.of(1), Arbitrary.of(2)]);
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
    it("has a default label", () => {
      const arb = Arbitrary.record({});
      assertEquals(arb.label, "record");
    });
    it("accepts a custom label", () => {
      const arb = Arbitrary.record({}, { label: "my label" });
      assertEquals(arb.label, "my label");
    });
  });

  describe("generateAll", () => {
    it("generates a single value for a constant", () => {
      const one = Arbitrary.from(() => 1);
      assertGenerated(one, [{ val: 1, picks: [] }]);
    });

    it("generates a single value for a filtered constant", () => {
      const one = Arbitrary.from(() => 1).filter((val) => val === 1);
      assertGenerated(one, [{ val: 1, picks: [] }]);
    });

    it("generates each value an integer range", () => {
      const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
      assertGenerated(oneTwoThree, [
        { val: 1, picks: [1] },
        { val: 2, picks: [2] },
        { val: 3, picks: [3] },
      ]);
    });

    it("generates both values for a boolean", () => {
      const boolean = Arbitrary.from(new PickRequest(0, 1)).map((b) => b === 1);
      assertGenerated(boolean, [
        { val: false, picks: [0] },
        { val: true, picks: [1] },
      ]);
    });

    it("generates the accepted values from a filter", () => {
      const bit = Arbitrary.from(new PickRequest(0, 1))
        .filter((b) => b === 0);
      assertGenerated(bit, [
        { val: 0, picks: [0] },
      ]);
    });

    it("generates every combination for an odometer", () => {
      const digit = new PickRequest(0, 9);
      const digits = Arbitrary.from((pick) => {
        const a = pick(digit);
        const b = pick(digit);
        const c = pick(digit);
        return a * 100 + b * 10 + c;
      });

      const vals = Array.from(digits.generateAll());
      assertEquals(vals[0].val, 0);
      assertEquals(vals[0].replies(), [0, 0, 0]);
      assertEquals(vals[999].val, 999);
      assertEquals(vals[999].replies(), [9, 9, 9]);
    });
  });

  describe("findGenerated", () => {
    const letters = Arbitrary.of("a", "b", "c");
    it("finds a generated value", () => {
      const gen = letters.findGenerated((v) => v === "b");
      assert(gen !== undefined);
      assertEquals(gen.val, "b");
    });
    it("throws if it doesn't find it", () => {
      assertEquals(letters.findGenerated((v) => v === "d"), undefined);
    });
    it("throws if it doesn't find it within the limit", () => {
      const letters = Arbitrary.of("a", "b", "c");
      assertThrows(
        () => letters.findGenerated((v) => v === "c", { limit: 2 }),
        Error,
        "findGenerated for '3 examples': no match found in the first 2 values",
      );
    });
  });

  describe("takeAll", () => {
    it("returns the only value of a constant", () => {
      const one = Arbitrary.from(() => 1);
      assertEquals(one.takeAll(), [1]);
    });

    const bit = Arbitrary.from(new PickRequest(0, 1));
    it("returns both bit values", () => {
      assertEquals(bit.takeAll(), [0, 1]);
    });

    it("handles a mapped Arbitrary", () => {
      const bool = bit.map((b) => b == 1);
      assertEquals(bool.takeAll(), [false, true]);
    });

    it("handles PlayoutPruned", () => {
      const notTwo = Arbitrary.from((pick) => {
        const n = pick(new PickRequest(1, 3));
        if (n === 2) throw new Pruned("skip 2");
        return n;
      });
      assertEquals(notTwo.takeAll(), [1, 3]);
    });

    it("handles a filtered Arbitrary", () => {
      const zero = bit.filter((b) => b === 0);
      assertEquals(zero.takeAll(), [0]);
    });

    it("handles a chained Arbitrary", () => {
      const hello = bit.chain((val) => {
        if (val === 1) {
          return Arbitrary.from(() => "there");
        } else {
          return Arbitrary.from(() => "hi");
        }
      });
      assertEquals(hello.takeAll(), ["hi", "there"]);
    });

    it("generates all values for a combination lock", () => {
      const digit = new PickRequest(1, 9);
      const digitCount = 3;
      const accepted = new Set(["[1,2,3]", "[1,4,3]"]);

      const digits = Arbitrary.from((pick) => {
        const picks: number[] = [];
        for (let i = 0; i < digitCount; i++) {
          picks.push(pick(digit));
        }
        return JSON.stringify(picks);
      });
      const lock = digits.filter(
        (pick) => accepted.has(pick),
        { maxTries: 1000 },
      );
      assertEquals(lock.takeAll(), [
        "[1,2,3]",
        "[1,4,3]",
      ]);
    });

    it("throws an exception if it can't find a value", () => {
      const letters = Arbitrary.of("a", "b", "c");
      assertThrows(
        () => letters.takeAll({ limit: 2 }),
        Error,
        "takeAll for '3 examples': array would have more than 2 elements",
      );
    });
  });

  describe("filter", () => {
    const sixSided = Arbitrary.from(new PickRequest(1, 6), {
      label: "sixSided",
    });

    it("disallows filters that don't allow any values through", () => {
      const rejectEverything = () => false;
      assertThrows(
        () => sixSided.filter(rejectEverything),
        Error,
        "filter: accept callback didn't match any values generated by 'sixSided'",
      );
    });
    it("keeps the default the same if it works", () => {
      const keepEverything = () => true;
      const filtered = sixSided.filter(keepEverything);
      assertEquals(filtered.takeAll(), [1, 2, 3, 4, 5, 6]);
    });
    it("changes the default to the next value that satisfies the predicate", () => {
      const keepEvens = (n: number) => n % 2 === 0;
      const filtered = sixSided.filter(keepEvens);
      assertEquals(filtered.takeAll(), [2, 4, 6]);
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
      assertEquals(filtered.takeAll(), [
        "[1,0]",
        "[0,1]",
      ]);
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
    it("has a label by default", () => {
      const original = Arbitrary.of(1, 2, 3);
      const filtered = original.filter(
        (n) => n === 2,
      );
      assertEquals(filtered.label, "unlabeled filter");
    });
    it("accepts a custom label", () => {
      const original = Arbitrary.of(1, 2, 3);
      const filtered = original.filter(
        (n) => n === 2,
        { label: "two" },
      );
      assertEquals(filtered.label, "two");
    });
    it("recovers cleanly when the filtered arbitrary throws Pruned", () => {
      const original = Arbitrary.from((pick) => {
        const n = pick(new PickRequest(1, 3));
        if (n === 2) throw new Pruned("skip 2");
        return n;
      });
      const filtered = original.filter(() => true);
      assertEquals(filtered.takeAll(), [1, 3]);
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      assertFirstGenerated(original, [{ val: 1, picks: [1] }]);

      const mapped = original.map((n) => n * 2);
      assertFirstGenerated(mapped, [{ val: 2, picks: [1] }]);
    });
    it("has a label by default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      const mapped = original.map((n) => n * 2);
      assertEquals(mapped.label, "map");
    });
    it("accepts a custom label", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      const mapped = original.map((n) => n * 2, { label: "double" });
      assertEquals(mapped.label, "double");
    });
  });

  describe("chain", () => {
    it("has a label by default", () => {
      const hello = Arbitrary.from(() => "hello");
      const world = hello.chain(() => Arbitrary.from(() => "world"));
      assertEquals(world.label, "chain");
    });
    it("accepts a custom label", () => {
      const hello = Arbitrary.from(() => "hello");
      const world = hello.chain(() => Arbitrary.from(() => "world"), {
        label: "hello",
      });
      assertEquals(world.label, "hello");
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

  describe("toString", () => {
    it("returns a string with the label", () => {
      const original = Arbitrary.of(1, 2, 3);
      assertEquals(original.toString(), "Arbitrary(3 examples)");
    });
  });
});
