import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, fail } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickDefault,
  alwaysPickMin,
  PickRequest,
} from "../src/picks.ts";
import { randomPicker } from "../src/random.ts";

import { TreeSearchPicker } from "../src/tree_search_picker.ts";

const bit = new PickRequest(0, 1);

describe("TreeSearchPicker", () => {
  describe("constructor", () => {
    it("starts a playout with no picks", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      assertEquals(picker.depth, 0);
      assertEquals(picker.getPicks(), []);
      assert(picker.tracked);
    });
  });

  describe("pick", () => {
    it("takes a pick from the underlying picker", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      assertEquals(picker.pick(bit), 0);
      assertEquals(picker.depth, 1);
      assertEquals(picker.getPicks(), [0]);
      assert(picker.tracked);
    });

    it("stops tracking if there aren't enough playouts to get to every branch", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      picker.pick(new PickRequest(1, 6));
      assertFalse(picker.tracked);
    });

    it("tracks if there are enough playouts to get to every branch", () => {
      const example = arb.record({
        "constantPicks": arb.int(0, 10),
        "playouts": arb.int(1, 1000),
      });
      repeatTest(example, ({ playouts, constantPicks }) => {
        const picker = new TreeSearchPicker(alwaysPickDefault, playouts);
        const justOne = new PickRequest(1, 1);
        for (let i = 0; i < constantPicks; i++) {
          picker.pick(justOne);
        }
        picker.pick(new PickRequest(1, playouts));
        assert(picker.tracked);
      });
    });

    it("never tracks if the search tree is too wide", () => {
      const examples = arb.of(1001);
      repeatTest(examples, (playouts) => {
        const picker = new TreeSearchPicker(alwaysPickDefault, playouts);
        picker.pick(new PickRequest(1, playouts));
        assertFalse(picker.tracked);
      });
    });

    it("doesn't revisit a constant in an unbalanced tree", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1000);

      const firstPick = picker.pick(bit);
      assert(picker.tracked);

      picker.backTo(0);
      assert(picker.pick(bit) !== firstPick);
      picker.pick(new PickRequest(1, 2 ** 40));
      assertFalse(picker.tracked);

      picker.backTo(0);
      assert(picker.pick(bit) !== firstPick);
    });
  });

  describe("backTo", () => {
    it("ends the search after one playout for a constant", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      assertFalse(picker.backTo(0), "Shouldn't be more playouts");
    });

    it("starts a new playout after a pick", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      picker.pick(bit);

      assert(picker.backTo(0));
      assertEquals(picker.depth, 0);
      assertEquals(picker.getPicks(), []);
    });

    it("ends the search after two playouts for a coin flip", () => {
      const picker = new TreeSearchPicker(alwaysPickDefault, 1);
      picker.pick(bit);
      picker.backTo(0);
      picker.pick(bit);
      assertFalse(picker.backTo(0));
    });
  });

  it("fully explores a combination lock", () => {
    const examples = arb.of(
      alwaysPickDefault,
      alwaysPickMin,
      alwaysPick(3),
      randomPicker(123),
    );

    repeatTest(examples, (underlying) => {
      const digit = new PickRequest(0, 9);
      const picker = new TreeSearchPicker(underlying, 1000);

      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const picks: number[] = [];
        for (let j = 0; j < 3; j++) {
          const pick = picker.pick(digit);
          picks.push(pick);
        }
        assert(picker.tracked, "playout wasn't tracked");
        const key = JSON.stringify(picks);
        if (seen.has(key)) {
          fail(`duplicate picks: ${key}`);
        }
        seen.add(key);
        assertEquals(picker.backTo(0), i < 999);
      }

      const playouts = Array.from(seen.values());
      assertEquals(playouts.length, 1000);
      if (underlying === alwaysPickDefault) {
        assertEquals(playouts[0], "[0,0,0]");
        assertEquals(playouts[999], "[9,9,9]");
      }
    });
  });
});
