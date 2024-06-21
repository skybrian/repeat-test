import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { PickRequest } from "../../src/picks.ts";
import { Arbitrary, RETRY } from "../../src/arbitraries.ts";
import * as arb from "../../src/arbitraries.ts";
import { repeatTest } from "../../src/runner.ts";

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
      const len = arb.int(0, 1);
      const string = len.chain((len) =>
        arb.array(arb.example(["hi", "there"]), { min: len, max: len })
      );
      assertEquals(Array.from(string.members), [[], ["hi"], ["there"]]);
    });
    it("handles nested filters", () => {
      repeatTest(arb.int(2, 5), (skip) => {
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
