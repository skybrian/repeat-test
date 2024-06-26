import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertSolutions } from "../src/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest } from "../src/picks.ts";
import { PlayoutFailed } from "../src/playouts.ts";
import Arbitrary from "../src/arbitrary_class.ts";

describe("Arbitrary", () => {
  describe("constructor", () => {
    it("checks that the callback doesn't throw when given default picks", () => {
      const callback = () => {
        throw "oops";
      };
      assertThrows(() => new Arbitrary(callback));
    });
  });

  describe("filter", () => {
    const oneToSix = new PickRequest(1, 6);
    const sixSided = new Arbitrary((pick) => pick(oneToSix));

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
        assert(n !== 3);
      });
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const req = new PickRequest(1, 6, { default: 3 });
      const original = new Arbitrary((pick) => pick(req));
      assertEquals(original.default, 3);

      const mapped = original.map((n) => n * 2);
      assertEquals(mapped.default, 6);
    });
  });

  describe("parse", () => {
    const oneToSix = new PickRequest(1, 6);
    const sixSided = new Arbitrary((pick) => pick(oneToSix));
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
  });

  describe("the pick method created during a parse", () => {
    const bit = new PickRequest(0, 1);

    function makeMock() {
      const answers: number[] = [];
      const exceptions: unknown[] = [];
      const mock = new Arbitrary((pick) => {
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

  describe("members", () => {
    it("returns the only value of a constant", () => {
      const one = new Arbitrary(() => 1);
      assertEquals(Array.from(one.members), [1]);
    });

    const bit = new Arbitrary((pick) => pick(new PickRequest(0, 1)));
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
      const onlyThree = new Arbitrary((pick) => {
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
          return new Arbitrary(() => "there");
        } else {
          return new Arbitrary(() => "hi");
        }
      });
      assertEquals(Array.from(hello.members), ["hi", "there"]);
    });

    it("can solve a combination lock if given enough tries", () => {
      const digits = new Arbitrary((pick) => {
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
      const one = new Arbitrary(() => 1);
      assertSolutions(one, [{ val: 1, picks: [] }]);
    });

    it("returns each solution for an int range", () => {
      const oneTwoThree = new Arbitrary((pick) => {
        return pick(new PickRequest(1, 3));
      });
      assertSolutions(oneTwoThree, [
        { val: 1, picks: [1] },
        { val: 2, picks: [2] },
        { val: 3, picks: [3] },
      ]);
    });

    it("returns each solution for a boolean", () => {
      const bit = new Arbitrary((pick) => {
        return pick(new PickRequest(0, 1));
      });
      const boolean = bit.map((b) => b == 1);
      const expected = [
        { val: false, picks: [[0]] },
        { val: true, picks: [[1]] },
      ];
      assertSolutions(boolean, expected);
    });
  });
});
