import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { PickRequest } from "../../src/picks.ts";
import { Arbitrary, RETRY } from "../../src/arbitraries.ts";
import * as arb from "../../src/arbitraries.ts";
import { repeatTest } from "../../src/runner.ts";

import { assertParseFails, assertParses } from "../../src/asserts.ts";

const oneToSix = new PickRequest(1, 6);
const sixSided = new Arbitrary((pick) => pick(oneToSix));

describe("Arbitrary", () => {
  describe("constructor", () => {
    it("disallows parsers that don't have a default", () => {
      assertThrows(() => new Arbitrary(() => RETRY));
    });
  });
  describe("filter", () => {
    it("disallows filters that doesn't accept the default", () => {
      const rejectEverything = () => false;
      assertThrows(() => sixSided.filter(rejectEverything));
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
  describe("members", () => {
    it("returns the only member of a constant Arbitrary", () => {
      const one = new Arbitrary(() => 1);
      assertEquals(Array.from(one.members), [1]);
    });
    it("returns each example from a boolean", () => {
      const members = Array.from(arb.boolean.members);
      assertEquals(members, [false, true]);
    });
    it("handles a mapped Arbitrary", () => {
      const bit = arb.boolean.map((b) => b ? 1 : 0);
      const members = Array.from(bit.members);
      assertEquals(members, [0, 1]);
    });
    it("handles a filtered Arbitrary", () => {
      const justFalse = arb.boolean.filter((b) => !b);
      assertEquals(Array.from(justFalse.members), [false]);
    });
    it("handles a chained Arbitrary", () => {
      const len = arb.chosenInt(0, 1);
      const string = len.chain((len) =>
        arb.array(arb.example(["hi", "there"]), { min: len, max: len })
      );
      assertEquals(Array.from(string.members), [[], ["hi"], ["there"]]);
    });
    it("handles nested filters", () => {
      repeatTest(arb.chosenInt(2, 5), (skip) => {
        const left = arb.example([1, 2, 3, 4, 5]).filter((n) => n != skip);
        const right = arb.example([6, 7, 8, 9, 10]);
        const both = arb.oneOf([left, right]);
        assertEquals(
          Array.from(both.members),
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => n != skip),
        );
      });
    });
  });
});

function intRangeTests(
  f: (
    min: number,
    max: number,
    opts?: { default?: number },
  ) => Arbitrary<number>,
) {
  it("should default to min for positive numbers", () => {
    assertEquals(f(1, 6).default, 1);
  });
  it("should default to max for negative numbers", () => {
    assertEquals(f(-6, -1).default, -1);
  });
  it("should default to 0 for a range that includes 0", () => {
    assertEquals(f(-6, 6).default, 0);
  });
  it("should default to a custom default value", () => {
    assertEquals(f(1, 6, { default: 3 }).default, 3);
  });
  it("should accept numbers in range", () => {
    for (let i = 1; i < 6; i++) {
      assertParses(f(1, 6), [i], i);
    }
  });
  it("should reject numbers out of range", () => {
    for (const n of [-1, 0, 7]) {
      assertParseFails(f(1, 6), [n], 1, 0);
    }
  });
}

describe("chosenInt", () => {
  intRangeTests(arb.chosenInt);
});

describe("biasedInt", () => {
  intRangeTests(arb.biasedInt);
});

describe("boolean", () => {
  it("should default to false", () => {
    assertParseFails(arb.boolean, [], false, 0);
  });
  it("should parse a 0 as false", () => {
    assertParses(arb.boolean, [0], false);
  });
  it("should parse a 1 as true", () => {
    assertParses(arb.boolean, [1], true);
  });
});

describe("example", () => {
  const oneWay = arb.example([1]);
  const twoWay = arb.example([1, 2]);
  it("shouldn't ask for a decision when there's only one example", () => {
    assertParses(oneWay, [], 1);
  });
  it("should default to the first example", () => {
    assertParseFails(twoWay, [], 1, 0);
  });
  it("should select the next example using the next item in the stream", () => {
    assertParses(twoWay, [0], 1);
    assertParses(twoWay, [1], 2);
  });
});

describe("oneOf", () => {
  const oneWay = arb.oneOf([
    arb.chosenInt(1, 2),
  ]);
  const threeWay = arb.oneOf([
    arb.chosenInt(1, 2),
    arb.chosenInt(3, 4),
    arb.chosenInt(5, 6),
  ]);
  it("should default to the first branch", () => {
    assertParseFails(oneWay, [], 1, 0);
    assertParseFails(threeWay, [], 1, 0);
  });
  it("shouldn't ask for a decision when there's only one branch", () => {
    assertParses(oneWay, [1], 1);
  });
  it("should select a branch using the next item in the stream", () => {
    assertParses(threeWay, [0, 1], 1);
    assertParses(threeWay, [1, 3], 3);
    assertParses(threeWay, [2, 5], 5);
  });
});
