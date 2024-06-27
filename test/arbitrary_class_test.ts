import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertSolutions } from "../src/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { alwaysPickDefault, PickRequest } from "../src/picks.ts";
import { PlayoutFailed } from "../src/playouts.ts";
import Arbitrary from "../src/arbitrary_class.ts";

describe("Arbitrary", () => {
  describe("from", () => {
    it("accepts a PickRequest", () => {
      const pick = new PickRequest(1, 2);
      const arbitrary = Arbitrary.from(pick);
      assertEquals(Array.from(arbitrary.members), [1, 2]);
    });
    it("checks that the callback doesn't throw when given default picks", () => {
      const callback = () => {
        throw "oops";
      };
      assertThrows(() => Arbitrary.from(callback));
    });
    it("accepts a constant record shape", () => {
      const arb = Arbitrary.from({ a: Arbitrary.of(1), b: Arbitrary.of(2) });
      assertEquals(arb.default, { a: 1, b: 2 });
      assertEquals(arb.maxSize, 1);
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
        assertEquals(arb.pick(alwaysPickDefault), 1);
      });
      it("accepts an Arbitrary", () => {
        const req = Arbitrary.of("hi", "there");
        const arb = Arbitrary.from((pick) => pick(req));
        assertEquals(arb.pick(alwaysPickDefault), "hi");
      });
      it("accepts a record shape", () => {
        const req = {
          a: Arbitrary.of("hi", "there"),
          b: Arbitrary.of(1, 2),
        };
        const arb = Arbitrary.from((pick) => pick(req));
        assertEquals(arb.pick(alwaysPickDefault), { a: "hi", b: 1 });
      });
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
      const mapped = sixSided.filter(keepEverything);
      assertEquals(mapped.default, 1);
    });
    it("changes the default to the next value that satisfies the predicate", () => {
      const keepEvens = (n: number) => n % 2 === 0;
      const mapped = sixSided.filter(keepEvens);
      assertEquals(mapped.default, 2);
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
        const exceptions: unknown[] = [];
        const mock = Arbitrary.from((pick) => {
          try {
            answers.push(pick(bit));
          } catch (e) {
            exceptions.push(e);
          }
          return 123;
        });
        // clear anything that happened during the constructor
        answers.length = 0;
        exceptions.length = 0;
        return { mock, answers, exceptions };
      }

      describe("when there is no input", () => {
        it("it throws PlayoutFailed", () => {
          const { mock, answers, exceptions } = makeMock();
          mock.parse([]);
          assertEquals(answers, []);
          assertEquals(exceptions.length, 1);
          assert(exceptions[0] instanceof PlayoutFailed);
        });
      });
      describe("when the input is in range", () => {
        it("returns the next pick", () => {
          const { mock, answers, exceptions } = makeMock();
          mock.parse([1]);
          assertEquals(answers, [1]);
          assertEquals(exceptions.length, 0);
        });
      });
      describe("when the input is out of range", () => {
        it("throws PlayoutFailed", () => {
          const { mock, answers, exceptions } = makeMock();
          mock.parse([2]);
          assertEquals(answers, []);
          assertEquals(exceptions.length, 1);
          assert(exceptions[0] instanceof PlayoutFailed);
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

    it("handles PlayoutFailed", () => {
      const onlyThree = Arbitrary.from((pick) => {
        const n = pick(new PickRequest(2, 3, { default: 3 }));
        if (n !== 3) throw new PlayoutFailed("not 3");
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
    it("returns the only solution for a constant", () => {
      const one = Arbitrary.from(() => 1);
      assertSolutions(one, [{ val: 1, picks: [] }]);
    });

    it("returns the only solution for a filtered constant", () => {
      const one = Arbitrary.from(() => 1).filter((val) => val === 1);
      assertSolutions(one, [{ val: 1, picks: [] }]);
    });

    it("returns each solution for an int range", () => {
      const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
      assertSolutions(oneTwoThree, [
        { val: 1, picks: [1] },
        { val: 2, picks: [2] },
        { val: 3, picks: [3] },
      ]);
    });

    it("returns each solution for a boolean", () => {
      const boolean = Arbitrary.from(new PickRequest(0, 1)).map((b) => b === 1);
      const expected = [
        { val: false, picks: [0] },
        { val: true, picks: [1] },
      ];
      assertSolutions(boolean, expected);
    });

    it("returns each solution for filtered PickRequest", () => {
      const bit = Arbitrary.from(new PickRequest(0, 1))
        .filter((b) => b === 0);
      assertSolutions(bit, [
        { val: 0, picks: [0] },
      ]);
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
