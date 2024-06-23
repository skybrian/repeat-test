import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { Arbitrary } from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import { ParserInput, PickRequest, PickRequestOptions } from "../src/picks.ts";

export function validRequest(
  opts?: arb.IntRangeOptions,
): Arbitrary<PickRequest> {
  const range = arb.intRange(opts);

  return arb.custom((pick) => {
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
      const example = arb.custom((pick) => {
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
      const example = arb.custom((pick) => {
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

describe("ParserInput", () => {
  describe("pick", () => {
    describe("when there is no input", () => {
      const stream = new ParserInput([]);
      it("chooses the request's default and fails", () => {
        repeatTest(validRequest(), (req) => {
          assertEquals(stream.pick(req), req.default);
          assertEquals(stream.errorOffset, 0);
          assertEquals(stream.finish(null).ok, false);
        });
      });
    });
    describe("when the pick is valid", () => {
      it("returns it", () => {
        const example = arb.custom((pick) => {
          const req = pick(validRequest());
          const n = pick(arb.int(req.min, req.max));
          const stream = new ParserInput([n]);
          return { req, n, stream };
        });
        repeatTest(example, ({ req, n, stream }) => {
          assertEquals(stream.pick(req), n);
          assertEquals(stream.offset, 1);
          assertEquals(stream.errorOffset, null);
          assertEquals(stream.finish(null).ok, true);
        });
      });
    });

    describe("when the pick is invalid", () => {
      it("chooses the request's default and fails", () => {
        const example = arb.custom((pick) => {
          const req = pick(validRequest());
          const n = pick(arb.intOutsideRange(req.min, req.max));
          const stream = new ParserInput([n]);
          return { req, stream };
        });
        repeatTest(example, ({ req, stream }) => {
          assertEquals(stream.pick(req), req.default);
          assertEquals(stream.errorOffset, 0);
          assertEquals(stream.finish(null).ok, false);
        });
      });
    });
  });
});
