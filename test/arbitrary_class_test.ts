import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertSolutions } from "../src/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { alwaysPick, defaultPlayout, PickRequest } from "../src/picks.ts";
import Arbitrary, {
  ArbitraryCallback,
  PickFailed,
} from "../src/arbitrary_class.ts";
import { SearchTree } from "../src/search_tree.ts";

describe("Arbitrary", () => {
  describe("from", () => {
    it("accepts a PickRequest", () => {
      const pick = new PickRequest(1, 2);
      const arbitrary = Arbitrary.from(pick);
      assertEquals(Array.from(arbitrary.members), [1, 2]);
    });
    it("throws if given a callback that throws", () => {
      const callback = () => {
        throw "oops";
      };
      assertThrows(() => Arbitrary.from(callback));
    });
    it("throws an Error if given a callback that calls pick incorrectly", () => {
      function f() {}
      type Pick = (arg: unknown) => number;
      const callback = ((pick: Pick) => pick(f)) as ArbitraryCallback<number>;
      assertThrows(() => Arbitrary.from(callback), Error);
    });
  });

  describe("record", () => {
    it("accepts a constant record shape", () => {
      const arb = Arbitrary.record({ a: Arbitrary.of(1), b: Arbitrary.of(2) });
      assertEquals(arb.default, { a: 1, b: 2 });
      assertEquals(arb.maxSize, 1);
    });
  });

  describe("oneOf", () => {
    it("accepts constant alteratives", () => {
      const arb = Arbitrary.oneOf([Arbitrary.of(1), Arbitrary.of(2)]);
      assertEquals(arb.default, 1);
      assertEquals(Array.from(arb.members), [1, 2]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("of", () => {
    it("throws if called with no arguments", () => {
      assertThrows(() => Arbitrary.of());
    });
    it("returns a constant Arbitrary if called with one argument", () => {
      const arb = Arbitrary.of("hi");
      assertEquals(arb.default, "hi");
      assertEquals(Array.from(arb.members), ["hi"]);
      assertSolutions(arb, [{ val: "hi", picks: [] }]);
      assertEquals(arb.maxSize, 1);
    });
    it("creates an Arbitrary with multiple arguments", () => {
      const arb = Arbitrary.of("hi", "there");
      assertEquals(arb.default, "hi");
      assertEquals(Array.from(arb.members), ["hi", "there"]);
      assertSolutions(arb, [
        { val: "hi", picks: [0] },
        { val: "there", picks: [1] },
      ]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("pick", () => {
    describe("the pick function (during a pick)", () => {
      it("accepts a PickRequest", () => {
        const req = new PickRequest(1, 2);
        const arb = Arbitrary.from((pick) => pick(req));
        const sol = arb.pick(defaultPlayout());
        assert(sol !== undefined);
        assertEquals(sol.val, 1);
      });
      it("accepts an Arbitrary", () => {
        const req = Arbitrary.of("hi", "there");
        const arb = Arbitrary.from((pick) => pick(req));
        const sol = arb.pick(defaultPlayout());
        assert(sol !== undefined);
        assertEquals(sol.val, "hi");
      });
      it("accepts a record shape", () => {
        const req = {
          a: Arbitrary.of("hi", "there"),
          b: Arbitrary.of(1, 2),
        };
        const arb = Arbitrary.from((pick) => pick(req));
        const sol = arb.pick(defaultPlayout());
        assert(sol !== undefined);
        assertEquals(sol.val, { a: "hi", b: 1 });
      });
    });
    it("retries a pick with a different playout", () => {
      const roll = new PickRequest(1, 6);
      const arb = Arbitrary.from((pick) => {
        const n = pick(roll);
        if (n === 3) {
          throw new PickFailed("try again");
        }
        return n;
      });
      const tree = new SearchTree(0);
      const sol = arb.pick(tree.pickers(alwaysPick(3)));
      assert(sol !== undefined);
      assertEquals(sol.val, 4);
    });
  });

  describe("filter", () => {
    const sixSided = Arbitrary.from(new PickRequest(1, 6));

    it("disallows filters that don't allow any solution", () => {
      const rejectEverything = () => false;
      assertThrows(() => sixSided.filter(rejectEverything));
    });
    it("keeps the default the same if it works", () => {
      const keepEverything = () => true;
      const filtered = sixSided.filter(keepEverything);
      assertEquals(filtered.default, 1);
    });
    it("changes the default to the next value that satisfies the predicate", () => {
      const keepEvens = (n: number) => n % 2 === 0;
      const filtered = sixSided.filter(keepEvens);
      assertEquals(filtered.default, 2);
      assertEquals(filtered.members.next().value, 2);
    });
    it("filters out values that don't satisfy the predicate", () => {
      const not3 = sixSided.filter((n) => n !== 3);
      repeatTest(not3, (n) => {
        assert(n !== 3, `want: not 3, got ${n}`);
      });
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6, { default: 3 }));
      assertEquals(original.default, 3);

      const mapped = original.map((n) => n * 2);
      assertEquals(mapped.default, 6);
    });
  });

  describe("parse", () => {
    const sixSided = Arbitrary.from(new PickRequest(1, 6));
    it("throws PlayoutFailed when not enough values were supplied", () => {
      assertThrows(() => sixSided.parse([]));
    });
    it("throws PlayoutFailed when too many values were supplied", () => {
      assertThrows(() => sixSided.parse([1, 1]));
    });
    it("throws PlayoutFailed for an out-of-range value", () => {
      assertThrows(() => sixSided.parse([7]));
    });
    it("returns the value from a successful parse", () => {
      for (let i = 1; i < 6; i++) {
        assertEquals(i, sixSided.parse([i]));
      }
    });

    describe("the pick function (during a parse)", () => {
      const bit = new PickRequest(0, 1);

      function makeMock() {
        const answers: number[] = [];
        const mock = Arbitrary.from((pick) => {
          answers.push(pick(bit));
          return 123;
        });
        // clear anything that happened during the constructor
        answers.length = 0;
        return { mock, answers };
      }

      describe("when there is no input", () => {
        it("it throws PlayoutFailed", () => {
          const { mock } = makeMock();
          assertThrows(() => mock.parse([]), PickFailed);
        });
      });
      describe("when the input is in range", () => {
        it("returns the next pick", () => {
          const { mock, answers } = makeMock();
          mock.parse([1]);
          assertEquals(answers, [1]);
        });
      });
      describe("when the input is out of range", () => {
        it("throws PlayoutFailed", () => {
          const { mock } = makeMock();
          assertThrows(() => mock.parse([2]), PickFailed);
        });
      });
    });
  });

  describe("members", () => {
    it("returns the only value of a constant", () => {
      const one = Arbitrary.from(() => 1);
      assertEquals(Array.from(one.members), [1]);
    });

    const bit = Arbitrary.from(new PickRequest(0, 1));
    it("returns each example of a bit", () => {
      const members = Array.from(bit.members);
      assertEquals(members, [0, 1]);
    });

    const boolean = bit.map((b) => b == 1);
    it("handles a mapped Arbitrary", () => {
      const members = Array.from(boolean.members);
      assertEquals(members, [false, true]);
    });

    it("handles PickFailed", () => {
      const onlyThree = Arbitrary.from((pick) => {
        const n = pick(new PickRequest(2, 3, { default: 3 }));
        if (n !== 3) throw new PickFailed("not 3");
        return n;
      });
      assertEquals(Array.from(onlyThree.members), [3]);
    });

    it("handles a filtered Arbitrary", () => {
      const justFalse = boolean.filter((b) => !b);
      assertEquals(Array.from(justFalse.members), [false]);
    });

    it("handles a chained Arbitrary", () => {
      const hello = boolean.chain((val) => {
        if (val) {
          return Arbitrary.from(() => "there");
        } else {
          return Arbitrary.from(() => "hi");
        }
      });
      assertEquals(Array.from(hello.members), ["hi", "there"]);
    });

    it("can solve a combination lock if given enough tries", () => {
      const digits = Arbitrary.from((pick) => {
        const a = pick(new PickRequest(0, 9));
        const b = pick(new PickRequest(0, 9));
        const c = pick(new PickRequest(0, 9));
        return [a, b, c];
      });
      const lock = digits.filter(
        ([a, b, c]) => a == 1 && (b == 2 || b == 4) && c == 3,
        { maxTries: 1000 },
      );
      assertEquals(lock.default, [1, 2, 3]);
      const solutions = Array.from(lock.members);
      assertEquals(solutions, [
        [1, 2, 3],
        [1, 4, 3],
      ]);
    });
  });

  describe("solutions", () => {
    it("finds the only solution for a constant", () => {
      const one = Arbitrary.from(() => 1);
      assertSolutions(one, [{ val: 1, picks: [] }]);
    });

    it("finds the only solution for a filtered constant", () => {
      const one = Arbitrary.from(() => 1).filter((val) => val === 1);
      assertSolutions(one, [{ val: 1, picks: [] }]);
    });

    it("finds each solution for an int range", () => {
      const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
      assertSolutions(oneTwoThree, [
        { val: 1, picks: [1] },
        { val: 2, picks: [2] },
        { val: 3, picks: [3] },
      ]);
    });

    it("finds each solution for a boolean", () => {
      const boolean = Arbitrary.from(new PickRequest(0, 1)).map((b) => b === 1);
      assertSolutions(boolean, [
        { val: false, picks: [0] },
        { val: true, picks: [1] },
      ]);
    });

    it("finds each solution for filtered PickRequest", () => {
      const bit = Arbitrary.from(new PickRequest(0, 1))
        .filter((b) => b === 0);
      assertSolutions(bit, [
        { val: 0, picks: [0] },
      ]);
    });

    it("finds every combination for an odometer", () => {
      const digit = new PickRequest(0, 9);
      const digits = Arbitrary.from((pick) => {
        const a = pick(digit);
        const b = pick(digit);
        const c = pick(digit);
        return a * 100 + b * 10 + c;
      });

      const sols = Array.from(digits.solutions);
      assertEquals(sols[0].val, 0);
      assertEquals(sols[0].playout.toNestedPicks(), [0, 0, 0]);
      assertEquals(sols[999].val, 999);
      assertEquals(sols[999].playout.toNestedPicks(), [9, 9, 9]);
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
});
