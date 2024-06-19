import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { ArrayPicker, PickRequest } from "../src/picks.ts";

export type Range = { min: number; max: number };

export const invalidRange = arb.oneOf<Range>([
  arb.example([{ min: 1, max: 0 }]),
  arb.record({ min: arb.safeInt, max: arb.nonInteger }),
  arb.record({ min: arb.nonInteger, max: arb.safeInt }),
]);

export const validRange = arb.oneOf<Range>([
  arb.example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
  arb.custom((pick) => {
    const extras = pick(arb.biasedInt(0, 100));
    const min = pick(
      arb.biasedInt(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - extras),
    );
    const max = min + extras;
    return { min, max };
  }),
]);

export const validRequest = arb.oneOf<PickRequest>([
  validRange.map(({ min, max }) => new PickRequest(min, max)),
  arb.custom((pick) => {
    const { min, max } = pick(validRange);
    const def = pick(arb.biasedInt(min, max));
    return new PickRequest(min, max, { default: def });
  }),
]);

describe("PickRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      repeatTest(invalidRange, ({ min, max }) => {
        assertThrows(() => new PickRequest(min, max));
      });
    });
    it("throws when given an invalid default", () => {
      const example = arb.custom((pick) => {
        const { min, max } = pick(validRange);
        const def = pick(
          arb.oneOf([arb.nonInteger, arb.intOutsideRange(min, max)]),
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
      repeatTest(validRange, ({ min, max }) => {
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
      const example = arb.custom((pick) => {
        const { min, max } = pick(validRange);
        const def = pick(arb.biasedInt(min, max));
        return { min, max, def };
      });
      repeatTest(example, ({ min, max, def }) => {
        const request = new PickRequest(min, max, { default: def });
        assertEquals(request.default, def);
      });
    });
  });
});

describe("ArrayPicker", () => {
  describe("next", () => {
    describe("for an empty array", () => {
      const stream = new ArrayPicker([]);
      it("chooses the request's default and fails", () => {
        repeatTest(validRequest, (req) => {
          assertEquals(stream.pick(req), req.default);
          assert(stream.failed);
          assertEquals(stream.errorOffset, 0);
        });
      });
    });
    describe("for an array containing a safe integer", () => {
      describe("when the pick is valid", () => {
        it("returns it", () => {
          const example = arb.custom((pick) => {
            const req = pick(validRequest);
            const n = pick(arb.biasedInt(req.min, req.max));
            const stream = new ArrayPicker([n]);
            return { req, n, stream };
          });
          repeatTest(example, ({ req, n, stream }) => {
            assertEquals(stream.pick(req), n);
          });
        });
      });
      describe("when the pick is invalid", () => {
        it("chooses the request's default and fails", () => {
          const example = arb.custom((pick) => {
            const req = pick(validRequest);
            const n = pick(arb.intOutsideRange(req.min, req.max));
            const stream = new ArrayPicker([n]);
            return { req, stream };
          });
          repeatTest(example, ({ req, stream }) => {
            assertEquals(stream.pick(req), req.default);
            assert(stream.failed);
            assertEquals(stream.errorOffset, 0);
          });
        });
      });
    });
  });
});
