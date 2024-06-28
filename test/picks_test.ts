import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { PickLog, PickRequest, PickRequestOptions } from "../src/picks.ts";

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

describe("PickLog", () => {
  describe("truncate", () => {
    it("throws if given a negative truncation", () => {
      const log = new PickLog();
      assertThrows(() => log.truncate(-1));
    });
    it("throws if given a truncation larger than the log", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      assertThrows(() => log.truncate(2));
    });
    it("does nothing if the log is empty", () => {
      const log = new PickLog();
      log.truncate(0);
      assertEquals(log.replies, []);
    });
    it("does nothing if there's nothing to remove", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      log.truncate(1);
      assertEquals(log.replies, [0]);
    });
    it("removes the last pick", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      log.push(new PickRequest(0, 0), 0);
      log.truncate(1);
      assertEquals(log.replies, [0]);
    });
  });
  describe("changed", () => {
    it("returns false if the log is empty", () => {
      const log = new PickLog();
      assertFalse(log.changed);
    });
    it("returns false if the last pick was unchanged", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      assertFalse(log.changed);
    });
    it("returns true if the last pick was changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      log.rotateLast();
      assert(log.changed);
    });
    it("returns true if a pick was changed, and then another pick added", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      log.rotateLast();
      log.push(new PickRequest(0, 0), 0);
      assert(log.changed);
    });
  });
  describe("rotateLast", () => {
    it("throws if the log is empty", () => {
      const log = new PickLog();
      assertThrows(() => log.rotateLast());
    });
    it("returns false if a pick cannot be changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      assertFalse(log.rotateLast());
      assertEquals(log.replies.at(-1), 0);
    });
    it("returns true if a pick was changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.rotateLast());
      assertEquals(log.replies.at(-1), 1);
    });
    it("wraps around", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 1);
      assert(log.rotateLast());
      assertEquals(log.replies.at(-1), 0);
    });
    it("returns false if it's rotated back to the original value", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.rotateLast());
      assertFalse(log.rotateLast());
      assertEquals(log.replies.at(-1), 0);
    });
  });
});
