import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import {
  DepthFirstPicker,
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
      log.next();
      assert(log.edited);
    });
    it("returns true if a pick was changed, and then another pick added", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      log.next();
      log.push(new PickRequest(0, 0), 0);
      assert(log.edited);
    });
  });
  describe("next", () => {
    it("returns false if the log is empty", () => {
      const log = new PickLog();
      assertFalse(log.next());
      assertEquals(log.replies, []);
    });
    it("removes the last picks if they can't be changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 0), 0);
      log.push(new PickRequest(0, 0), 0);
      assertFalse(log.next());
      assertEquals(log.replies, []);
    });
    it("rotates the last pick if it can be changed", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.next());
      assertEquals(log.replies, [1]);
    });
    it("wraps around", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 1);
      assert(log.next());
      assertEquals(log.replies, [0]);
    });
    it("removes the last pick if it rotates back to the original value", () => {
      const log = new PickLog();
      log.push(new PickRequest(0, 1), 0);
      assert(log.next());
      assertFalse(log.next());
      assertEquals(log.replies, []);
    });
  });
});

describe("DepthFirstPicker", () => {
  describe("backTo", () => {
    it("returns false if no picks happened", () => {
      const picker = new DepthFirstPicker();
      assertFalse(picker.backTo(0));
    });
    it("returns false if the root has no other children", () => {
      const picker = new DepthFirstPicker();
      assertEquals(picker.pick(new PickRequest(0, 0)), 0);
      assertFalse(picker.backTo(0));
    });
    const bit = new PickRequest(0, 1);
    it("goes back to a different child", () => {
      const picker = new DepthFirstPicker();
      assertEquals(picker.pick(bit), 0);
      assert(picker.backTo(0));
      assertEquals(picker.pick(bit), 1);
      assertFalse(picker.backTo(0));
    });
    it("throws if not at the end of a playout", () => {
      const picker = new DepthFirstPicker();
      assertEquals(picker.pick(bit), 0);
      assert(picker.backTo(0));
      assertThrows(() => picker.backTo(0));
    });
    it("goes back to a different child in a subtree", () => {
      const picker = new DepthFirstPicker();
      assertEquals(picker.pick(bit), 0);
      assertEquals(picker.pick(bit), 0);
      assert(picker.backTo(1));
      assertEquals(picker.depth, 1);
      assertEquals(picker.pick(bit), 1);
      assertFalse(picker.backTo(1));
    });
  });
  it("fully explores a combination lock", () => {
    const digit = new PickRequest(0, 9);
    const dialCount = 3;
    const leaves = new Set<string>();
    const picker = new DepthFirstPicker();
    while (true) {
      while (picker.depth < dialCount) {
        picker.pick(digit);
      }
      const leaf = JSON.stringify(picker.getPicks());
      assertFalse(leaves.has(leaf));
      leaves.add(leaf);
      if (!picker.backTo(0)) {
        break;
      }
    }
    assertEquals(leaves.size, 1000);
    assertEquals(Array.from(leaves)[0], "[0,0,0]");
    assertEquals(Array.from(leaves)[999], "[9,9,9]");
  });
});
