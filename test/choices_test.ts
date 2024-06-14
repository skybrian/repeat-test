import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { invalidRange, validRange } from "../src/ranges.ts";
import * as arb from "../src/arbitraries.ts";
import SimpleRunner from "../src/simple_runner.ts";

import { Arbitrary, ChoiceRequest } from "../src/choices.ts";

const runner = new SimpleRunner();

function badDefault(min: number, max: number): Arbitrary<number> {
  return arb.custom((it): number => {
    switch (it.gen(arb.biasedInt(1, 3))) {
      case 2:
        if (min - 1 < min) return min - 1;
        return min - 2 ** 32;
      case 3:
        if (max + 1 > max) return max + 1;
        return max + 2 ** 32;
    }
    return it.gen(arb.nonInteger);
  });
}

describe("ChoiceRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      runner.check(invalidRange, ({ min, max }) => {
        assertThrows(() => new ChoiceRequest(min, max));
      });
    });
    it("throws when given an invalid default", () => {
      const example = arb.custom((it) => {
        const { min, max } = it.gen(validRange);
        const def = it.gen(badDefault(min, max));
        return { min, max, def };
      });
      runner.check(example, ({ min, max, def }) => {
        assertThrows(() => new ChoiceRequest(min, max, { default: def }));
      });
    });
  });
  describe("default", () => {
    it("returns the number closest to zero when not overridden", () => {
      runner.check(validRange, ({ min, max }) => {
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
      runner.check(example, ({ min, max, def }) => {
        const request = new ChoiceRequest(min, max, { default: def });
        assertEquals(request.default, def);
      });
    });
  });
});
