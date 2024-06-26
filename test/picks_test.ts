import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { PickRequest, PickRequestOptions } from "../src/picks.ts";

export function validRequest(
  opts?: arb.IntRangeOptions,
): Arbitrary<PickRequest> {
  const range = arb.intRange(opts);

  return arb.from((pick) => {
    const { min, max } = pick(range);

    const opts: PickRequestOptions = {};
    if (pick(arb.boolean())) {
      opts.default = pick(arb.int(min, max));
    }
    return new PickRequest(min, max, opts);
  });
}

describe("PickRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      repeatTest(arb.invalidIntRange(), ({ min, max }) => {
        assertThrows(() => new PickRequest(min, max));
      });
    });
    it("throws when given an invalid default", () => {
      const example = arb.from((pick) => {
        const { min, max } = pick(arb.intRange());
        const def = pick(
          arb.oneOf([arb.nonInteger(), arb.intOutsideRange(min, max)]),
        );
        return { min, max, def };
      });
      repeatTest(example, ({ min, max, def }) => {
        assertThrows(() => new PickRequest(min, max, { default: def }));
      });
    });
  });
  describe("default", () => {
    it("returns the number closest to zero when not overridden", () => {
      repeatTest(arb.intRange(), ({ min, max }) => {
        const request = new PickRequest(min, max);
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
      const example = arb.from((pick) => {
        const { min, max } = pick(arb.intRange());
        const def = pick(arb.int(min, max));
        return { min, max, def };
      });
      repeatTest(example, ({ min, max, def }) => {
        const request = new PickRequest(min, max, { default: def });
        assertEquals(request.default, def);
      });
    });
  });
});
