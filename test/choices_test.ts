import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { invalidRange, validRange } from "../src/requests.ts";
import * as arb from "../src/arbitraries.ts";
import TestRunner from "../src/simple_runner.ts";

import { ChoiceRequest } from "../src/choices.ts";

const runner = new TestRunner();

describe("ChoiceRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      runner.repeat(invalidRange, ({ min, max }) => {
        assertThrows(() => new ChoiceRequest(min, max));
      });
    });
    it("throws when given an invalid default", () => {
      const example = arb.custom((it) => {
        const { min, max } = it.gen(validRange);
        const def = it.gen(
          arb.oneOf([arb.nonInteger, arb.intOutsideRange(min, max)]),
        );
        return { min, max, def };
      });
      runner.repeat(example, ({ min, max, def }) => {
        assertThrows(() => new ChoiceRequest(min, max, { default: def }));
      });
    });
  });
  describe("default", () => {
    it("returns the number closest to zero when not overridden", () => {
      runner.repeat(validRange, ({ min, max }) => {
        const request = new ChoiceRequest(min, max);
        assert(request.default >= min);
        assert(request.default <= max);
        if (min >= 0) {
          assertEquals(request.default, min);
        } else if (max <= 0) {
          assertEquals(request.default, max);
        } else {
          assertEquals(request.default, 0);
        }
      });
    });
    it("returns the overridden default when given", () => {
      const example = arb.custom((it) => {
        const { min, max } = it.gen(validRange);
        const def = it.gen(arb.biasedInt(min, max));
        return { min, max, def };
      });
      runner.repeat(example, ({ min, max, def }) => {
        const request = new ChoiceRequest(min, max, { default: def });
        assertEquals(request.default, def);
      });
    });
  });
});
