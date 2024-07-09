import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  fail,
} from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import {
  alwaysPick,
  alwaysPickDefault,
  alwaysPickMin,
  PickRequest,
} from "../src/picks.ts";
import { randomPicker } from "../src/random.ts";

import { Cursor, SearchTree } from "../src/search_tree.ts";

const bit = new PickRequest(0, 1);

describe("SearchTree", () => {
  describe("makePicker", () => {
    it("starts a playout with no picks", () => {
      const tree = new SearchTree(1);
      const picker = tree.makePicker(alwaysPickDefault);
      assert(picker !== undefined);
      assertEquals(picker.depth, 0);
      assertEquals(picker.getPicks(), []);
      assert(picker.tracked);
    });
  });

  describe("pickers", () => {
    it("starts a new playout each time", () => {
      const tree = new SearchTree(4);

      let count = 0;
      for (let i = 0; i < 2; i++) {
        const pickers = tree.pickers(alwaysPickDefault);
        for (const p of pickers) {
          assertEquals(p.depth, 0);
          assertEquals(p.pick(new PickRequest(0, 3)), count);
          assertEquals(p.depth, 1);
          count++;
          if (count % 2 == 0) break;
        }
      }
      const empty = tree.pickers(alwaysPickDefault);
      assert(empty.next().done);
      assertEquals(count, 4);
    });
  });
});

describe("Cursor", () => {
  describe("pick", () => {
    const int32 = new PickRequest(-(2 ** 31), 2 ** 31 - 1);

    it("takes a pick from the underlying picker", () => {
      const tree = new SearchTree(1);
      const picker = tree.makePicker(alwaysPickDefault);
      assert(picker !== undefined);
      assertEquals(picker.pick(bit), 0);
      assertEquals(picker.depth, 1);
      assertEquals(picker.getPicks(), [0]);
      assert(picker.tracked);
    });

    it("requires the same range as last time", () => {
      const tree = new SearchTree(1);
      const picker = tree.makePicker(alwaysPickDefault);
      assert(picker !== undefined);
      assertEquals(picker.pick(bit), 0);
      picker.backTo(0);
      assertThrows(() => picker.pick(new PickRequest(-1, 0)), Error);
    });

    describe("when using a non-random underlying picker", () => {
      it("continues tracking beneath a wide node", () => {
        const tree = new SearchTree(1);
        const picker = tree.makePicker(alwaysPickDefault);
        assert(picker !== undefined);
        picker.pick(int32);
        assert(picker.tracked);
      });
    });

    describe("when using a random underlying picker", () => {
      it("stops tracking if there aren't enough playouts to get to every branch", () => {
        const tree = new SearchTree(1);
        const picker = tree.makePicker(randomPicker(123));
        assert(picker !== undefined);
        picker.pick(new PickRequest(1, 6));
        assertFalse(picker.tracked);
      });

      it("tracks if there are enough playouts to get to every branch", () => {
        const example = arb.record({
          "constantPicks": arb.int(0, 10),
          "playouts": arb.int(1, 1000),
        });
        repeatTest(example, ({ playouts, constantPicks }) => {
          const tree = new SearchTree(playouts);
          const picker = tree.makePicker(randomPicker(123));
          assert(picker !== undefined);
          const justOne = new PickRequest(1, 1);
          for (let i = 0; i < constantPicks; i++) {
            picker.pick(justOne);
          }
          picker.pick(new PickRequest(1, playouts));
          assert(picker.tracked);
        });
      });

      it("doesn't track a very wide node", () => {
        assertEquals(int32.size, 2 ** 32);

        repeatTest(
          arb.of(0, 1, 1000, 10 ** 6, 10 ** 9, 2 ** 30),
          (playouts) => {
            const tree = new SearchTree(playouts);
            const picker = tree.makePicker(randomPicker(123));
            assert(picker !== undefined);
            picker.pick(int32);
            assertFalse(picker.tracked);
          },
        );
      });

      it("doesn't revisit a constant in an unbalanced tree", () => {
        const tree = new SearchTree(1000);
        const picker = tree.makePicker(randomPicker(123));
        assert(picker !== undefined);

        const counts = {
          constants: 0,
          other: 0,
        };
        for (let i = 0; i < 1000; i++) {
          if (picker.pick(bit)) {
            picker.pick(new PickRequest(1, 2 ** 40));
            counts.other++;
          } else {
            picker.pick(new PickRequest(1, 2));
            counts.constants++;
          }
          picker.backTo(0);
        }

        assertEquals(counts, {
          constants: 2,
          other: 998,
        });
      });
    });
  });

  describe("backTo", () => {
    describe("for a depth-first search", () => {
      function makePicker(): Cursor {
        const tree = new SearchTree(0);
        const picker = tree.makePicker(alwaysPickDefault);
        assert(picker !== undefined);
        return picker;
      }
      let picker = makePicker();

      beforeEach(() => {
        picker = makePicker();
      });

      it("ends the search if no root was created (for a constant)", () => {
        assertFalse(picker.backTo(0), "Shouldn't be more playouts");
      });

      it("ends the search if the root has no other children", () => {
        picker.pick(new PickRequest(0, 0));
        assertFalse(picker.backTo(0));
      });

      it("starts a new playout when there's a fork", () => {
        picker.pick(bit);
        assert(picker.backTo(0));
        assertEquals(picker.depth, 0);
        assertEquals(picker.getPicks(), []);
      });

      it("goes to a different child after a fork", () => {
        picker.pick(bit);
        picker.backTo(0);
        assertEquals(picker.pick(bit), 1);
      });

      it("ends the search when both sides of a fork were visited", () => {
        picker.pick(bit);
        picker.backTo(0);
        picker.pick(bit);
        assertFalse(picker.backTo(0));
      });

      it("goes back to a non-zero level", () => {
        picker.pick(bit);
        picker.pick(bit);
        picker.backTo(1);
        assertEquals(picker.depth, 1);
      });

      it("goes to a different child after going back to a non-zero level", () => {
        picker.pick(bit);
        picker.pick(bit);
        picker.backTo(1);

        assertEquals(picker.pick(bit), 1);
        assertFalse(
          picker.backTo(1),
          "should fail because picks are exhausted",
        );
        assert(picker.backTo(0));
      });
    });
  });

  it("fully explores a combination lock", () => {
    const underlyingPickers = arb.oneOf([
      arb.of(
        alwaysPickDefault,
        alwaysPickMin,
        alwaysPick(3),
      ),
      arb.int32().map((seed) => randomPicker(seed)),
    ]);

    repeatTest(underlyingPickers, (underlying) => {
      const digit = new PickRequest(0, 9);
      const tree = new SearchTree(2000);
      const picker = tree.makePicker(underlying);
      assert(picker !== undefined);

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
    }, { reps: 100 });
  });
});
