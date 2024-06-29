import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import {
  everyPath,
  PickLog,
  PickRequest,
  PickRequestOptions,
} from "../src/picks.ts";

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
  describe("edited", () => {
    it("returns false if the log is empty", () => {
      const log = new PickLog();
      assertFalse(log.edited);
    });
    it("returns false if the last pick was unchanged", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      assertFalse(log.edited);
    });
    it("returns true if the last pick was changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      log.increment();
      assert(log.edited);
    });
    it("returns true if a pick was changed, and then another pick added", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      log.increment();
      log.push(new PickRequest(0, 0), 0);
      assert(log.edited);
    });
  });
  describe("increment", () => {
    it("returns false if the log is empty", () => {
      const log = new PickLog();
      assertFalse(log.increment());
      assertEquals(log.replies, []);
    });
    it("removes the last picks if they can't be changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      log.push(new PickRequest(0, 0), 0);
      assertFalse(log.increment());
      assertEquals(log.replies, []);
    });
    it("rotates the last pick if it can be changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.increment());
      assertEquals(log.replies, [1]);
    });
    it("wraps around", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 1);
      assert(log.increment());
      assertEquals(log.replies, [0]);
    });
    it("removes the last pick if it rotates back to the original value", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.increment());
      assertFalse(log.increment());
      assertEquals(log.replies, []);
    });
  });
  describe("getPickPath", () => {
    it("returns the empty path if the log is empty", () => {
      const log = new PickLog();
      const path = log.getPickPath();
      assertEquals(path.depth, 0);
      assertEquals(path.entries, []);
      assertEquals(path.replies, []);
    });

    const digit = new PickRequest(0, 9);

    it("returns the current path if the log is not empty", () => {
      const log = new PickLog();
      log.push(digit, 0);
      const path = log.getPickPath();
      assertEquals(path.depth, 1);
      assertEquals(path.entries, [{ req: digit, reply: 0 }]);
      assertEquals(path.replies, [0]);
    });
    it("invalidates the previous PickPath", () => {
      const log = new PickLog();
      log.push(digit, 0);
      const path = log.getPickPath();
      assertEquals(path.depth, 1);
      log.getPickPath();
      assertThrows(() => path.depth);
      assertThrows(() => path.entries);
      assertThrows(() => path.replies);
    });

    describe("truncate", () => {
      it("throws if given a negative index", () => {
        const path = new PickLog().getPickPath();
        assertThrows(() => path.truncate(-1));
      });
      it("throws if given a truncation larger than the log", () => {
        const log = new PickLog();
        log.push(new PickRequest(0, 0), 0);
        const path = log.getPickPath();
        assertThrows(() => path.truncate(2));
      });
      it("does nothing if the log is empty", () => {
        const path = new PickLog().getPickPath();
        path.truncate(0);
        assertEquals(path.replies, []);
      });
      it("does nothing if there's nothing to remove", () => {
        const log = new PickLog();
        log.push(new PickRequest(0, 0), 0);
        log.getPickPath().truncate(1);
        assertEquals(log.replies, [0]);
      });
      it("removes the last pick", () => {
        const log = new PickLog();
        log.push(new PickRequest(0, 0), 0);
        const path = log.getPickPath();
        path.addChild(new PickRequest(0, 0), 0);
        path.truncate(1);
        assertEquals(log.replies, [0]);
      });
    });
    describe("addChild", () => {
      it("appends to the log", () => {
        const log = new PickLog();
        log.push(digit, 0);
        const path = log.getPickPath();
        assertEquals(path.replies, [0]);
        path.addChild(digit, 1);
        assertEquals(log.replies, [0, 1]);
        assertEquals(path.replies, log.replies);
        path.addChild(digit, 0);
        assertEquals(path.replies, [0, 1, 0]);
        assertEquals(path.replies, log.replies);
      });
    });
  });
});

describe("everyPath", () => {
  it("exits after the first visit if no root node is defined", () => {
    const paths = [];
    for (const path of everyPath()) {
      paths.push(path.replies);
      assertEquals(path.depth, 0);
      assertEquals(path.entries, []);
      assertEquals(path.replies, []);
    }
    assertEquals(paths, [[]]);
  });
  it("visits each other child of a root node", () => {
    const threeWay = new PickRequest(0, 2);
    const paths = [];
    for (const path of everyPath()) {
      paths.push(path.replies);
      if (path.depth === 0) {
        path.addChild(threeWay, 1);
      }
    }
    assertEquals(paths, [[], [2], [0]]);
  });
  it("fully explores a combination lock", () => {
    const digit = new PickRequest(0, 9);
    const dialCount = 3;
    const leaves = new Set<string>();
    for (const path of everyPath()) {
      while (path.depth < dialCount) {
        path.addChild(digit, 0);
      }
      const leaf = JSON.stringify(path.replies);
      assertFalse(leaves.has(leaf));
      leaves.add(leaf);
    }
    assertEquals(leaves.size, 1000);
    assertEquals(Array.from(leaves)[0], "[0,0,0]");
    assertEquals(Array.from(leaves)[999], "[9,9,9]");
  });
});
