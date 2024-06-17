import { describe, it } from "@std/testing/bdd";
import { assert, assertThrows } from "@std/assert";
import TestRunner from "../src/simple_runner.ts";

import { ChoiceRequest } from "../src/choices.ts";
import { Arbitrary, RETRY } from "../src/core.ts";

const runner = new TestRunner();
const oneToSix = new ChoiceRequest(1, 6);
const sixSided = new Arbitrary((it) => it.next(oneToSix));

describe("Arbitrary", () => {
  describe("constructor", () => {
    it("disallows parsers that don't have a default", () => {
      assertThrows(() => new Arbitrary(() => RETRY));
    });
  });
  describe("filter", () => {
    it("filters out values that don't satisfy the predicate", () => {
      const not3 = sixSided.filter((n) => n !== 3);
      runner.repeat(not3, (n) => {
        assert(n !== 3);
      });
    });
    it("disallows filters that doesn't accept the default", () => {
      const rejectEverything = () => false;
      assertThrows(() => sixSided.filter(rejectEverything));
    });
  });
});
