import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { Arbitrary } from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";
import { randomPicker } from "../src/random.ts";

import {
  alwaysChooseMin,
  IntPicker,
  ParserInput,
  PickRequest,
  PickStack,
} from "../src/picks.ts";

export function validRequest(
  opts?: arb.IntRangeOptions,
): Arbitrary<PickRequest> {
  const range = arb.intRange(opts);
  return arb.oneOf<PickRequest>([
    range.map(({ min, max }) => new PickRequest(min, max)),
    arb.custom((pick) => {
      const { min, max } = pick(range);
      const def = pick(arb.int(min, max));
      return new PickRequest(min, max, { default: def });
    }),
  ]);
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

describe("PickStack", () => {
  const validRequestAndReply = arb.custom((pick) => {
    const req = pick(validRequest());
    const n = pick(req);
    return { req, n };
  });

  describe("record", () => {
    it("accepts any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const fakePicker = { pick: () => n };
        const rec = new PickStack(fakePicker);
        assertEquals(rec.length, 0);
        assertEquals(rec.record().pick(req), n);
        assertEquals(rec.length, 1);
      });
    });
  });
  describe("play", () => {
    it("replays any pick", () => {
      repeatTest(validRequestAndReply, ({ req, n }) => {
        const fakePicker = { pick: () => n };
        const rec = new PickStack(fakePicker);
        assertEquals(rec.record().pick(req), n);
        assertEquals(rec.play().pick(req), n);
        assertEquals(rec.length, 1);
      });
    });
  });

  describe("playNext", () => {
    function collectReplays(
      stack: PickStack,
      requests: PickRequest[],
    ): Set<string> {
      const result = new Set<string>();

      let replay: IntPicker | null = stack.play();
      while (replay != null) {
        const picks: number[] = [];
        for (const req of requests) {
          picks.push(replay.pick(req));
        }
        const key = JSON.stringify(picks);
        assertFalse(result.has(key), `already saw ${key}`);
        result.add(key);

        replay = stack.playNext();
      }

      return result;
    }

    it("plays back every combination for an odometer", () => {
      const digit = new PickRequest(0, 9);
      const digits = Array(3).fill(digit);

      // set to 0, 0, 0
      const stack = new PickStack(alwaysChooseMin);
      const record = stack.record();
      digits.forEach((req) => record.pick(req));

      const combos = Array.from(collectReplays(stack, digits));
      assertEquals(combos[0], "[0,0,0]");
      assertEquals(combos[999], "[9,9,9]");
      assertEquals(combos.length, 1000);
    });

    it("always returns a combination of valid picks that hasn't been seen", () => {
      const example = arb.record({
        requests: arb.array(validRequest({ maxSize: 3 })),
        seed: arb.int32(),
      });
      repeatTest(example, ({ requests, seed }) => {
        const stack = new PickStack(randomPicker(seed));

        // record some random picks
        const recorder = stack.record();
        const original: number[] = [];
        for (const req of requests) {
          const n = recorder.pick(req);
          assert(n >= req.min);
          assert(n <= req.max);
          original.push(n);
        }

        collectReplays(stack, requests);
      });
    });
  });
});
