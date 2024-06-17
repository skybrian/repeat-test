import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import TestRunner from "../src/simple_runner.ts";

import { ArrayChoices, ChoiceRequest } from "../src/choices.ts";

const runner = new TestRunner();

export type Range = { min: number; max: number };

export const invalidRange = arb.oneOf<Range>([
  arb.example([{ min: 1, max: 0 }]),
  arb.record({ min: arb.safeInt, max: arb.nonInteger }),
  arb.record({ min: arb.nonInteger, max: arb.safeInt }),
]);

export const validRange = arb.oneOf<Range>([
  arb.example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
  arb.custom((it) => {
    const extras = it.gen(arb.biasedInt(0, 100));
    const min = it.gen(
      arb.biasedInt(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - extras),
    );
    const max = min + extras;
    return { min, max };
  }),
]);

export const validRequest = arb.oneOf<ChoiceRequest>([
  arb.custom((it) => {
    const { min, max } = it.gen(validRange);
    return new ChoiceRequest(min, max);
  }),
  arb.custom((it) => {
    const { min, max } = it.gen(validRange);
    const def = it.gen(arb.biasedInt(min, max));
    return new ChoiceRequest(min, max, { default: def });
  }),
]);

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

describe("ArrayChoices", () => {
  describe("next", () => {
    describe("for an empty array", () => {
      const stream = new ArrayChoices([]);
      it("chooses the request's default and fails", () => {
        runner.repeat(validRequest, (req) => {
          assertEquals(stream.next(req), req.default);
          assert(stream.failed);
          assertEquals(stream.errorOffset, 0);
        });
      });
    });
    describe("for an array containing a safe integer", () => {
      describe("when the choice is valid", () => {
        it("returns it", () => {
          const example = arb.custom((it) => {
            const req = it.gen(validRequest);
            const n = it.gen(arb.biasedInt(req.min, req.max));
            const stream = new ArrayChoices([n]);
            return { req, n, stream };
          });
          runner.repeat(example, ({ req, n, stream }) => {
            assertEquals(stream.next(req), n);
          });
        });
      });
      describe("when the choice is invalid", () => {
        it("chooses the request's default and fails", () => {
          const example = arb.custom((it) => {
            const req = it.gen(validRequest);
            const n = it.gen(arb.intOutsideRange(req.min, req.max));
            const stream = new ArrayChoices([n]);
            return { req, stream };
          });
          runner.repeat(example, ({ req, stream }) => {
            assertEquals(stream.next(req), req.default);
            assert(stream.failed);
            assertEquals(stream.errorOffset, 0);
          });
        });
      });
    });
  });
});
