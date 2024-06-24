import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { repeatTest } from "../../src/runner.ts";

import { PickRequest } from "../../src/picks.ts";
import { NOT_FOUND, Solution } from "../../src/solver.ts";
import { Arbitrary } from "../../src/arbitraries.ts";
import * as arb from "../../src/arbitraries.ts";

const oneToSix = new PickRequest(1, 6);
const sixSided = new Arbitrary((pick) => pick(oneToSix));

describe("Arbitrary", () => {
  describe("constructor", () => {
    it("disallows parsers that don't have a default", () => {
      assertThrows(() => new Arbitrary(() => NOT_FOUND));
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
      const members = Array.from(arb.boolean().members);
      assertEquals(members, [false, true]);
    });
    it("handles a mapped Arbitrary", () => {
      const bit = arb.boolean().map((b) => b ? 1 : 0);
      const members = Array.from(bit.members);
      assertEquals(members, [0, 1]);
    });
    it("handles a filtered Arbitrary", () => {
      const justFalse = arb.boolean().filter((b) => !b);
      assertEquals(Array.from(justFalse.members), [false]);
    });
    it("handles a chained Arbitrary", () => {
      const len = arb.int(0, 1);
      const string = len.chain((len) =>
        arb.array(arb.example(["hi", "there"]), { min: len, max: len })
      );
      assertEquals(Array.from(string.members), [[], ["hi"], ["there"]]);
    });
    it("can solve a combination lock", () => {
      const digits = arb.tuple(
        arb.int(0, 9, { default: 1 }),
        arb.int(0, 9, { default: 4 }),
        arb.int(0, 9, { default: 3 }),
      );
      const lock = digits.filter(([a, b, c]) =>
        a == 1 && (b == 2 || b == 4) && c == 3
      );
      const solutions = Array.from(lock.members);
      assertEquals(solutions, [
        [1, 4, 3],
        [1, 2, 3],
      ]);
    });
  });
  describe("solutions", () => {
    it("returns the only solution for a constant", () => {
      const expected: Solution<number>[] = [
        { val: 1, playout: { picks: [], spanStarts: [], spanEnds: [] } },
      ];
      const actual = Array.from(arb.just(1).solutions);
      assertEquals(actual, expected);
    });
    it("returns each solution of a boolean", () => {
      const expected: Solution<boolean>[] = [
        { val: false, playout: { picks: [0], spanStarts: [], spanEnds: [] } },
        { val: true, playout: { picks: [1], spanStarts: [], spanEnds: [] } },
      ];
      const actual = Array.from(arb.boolean().solutions);
      assertEquals(actual, expected);
    });
  });
});
