import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";

import * as arb from "../src/arbitraries/basics.ts";

import { PickRequest } from "../src/picks.ts";
import { PickTree } from "../src/pick_tree.ts";
import { Playout } from "../src/gen_class.ts";

function playout(reqs: PickRequest[], replies: number[]) {
  return new Playout(reqs, replies);
}

describe("PickTree", () => {
  describe("prune", () => {
    const bit = new PickRequest(0, 1);
    it("prunes the entire tree when given an empty playout", () => {
      const tree = new PickTree();
      assert(tree.prune(playout([], [])));
      assertFalse(tree.available([]));
      assert(tree.done);
    });
    it("prunes a child of the root node", () => {
      repeatTest([0, 1], (pick) => {
        const tree = new PickTree();
        assert(tree.prune(playout([bit], [pick])));
        assertFalse(tree.available([pick]));
        assertEquals(tree.branchesLeft([]), 1);
      });
    });
    it("prunes a child at arbitrary depth", () => {
      const example = arb.from((pick) => {
        const min = pick(arb.int(1, 2));
        const max = pick(arb.int(min, min + 5));
        const path = pick(arb.array(arb.int(min, max)));
        return { min, max, path };
      });
      repeatTest(example, ({ min, max, path }) => {
        const tree = new PickTree();
        const req = new PickRequest(min, max);
        const reqs = path.map((_) => req);
        assert(tree.prune(playout(reqs, path)));
        assertFalse(tree.available(path), "not pruned");
        if (path.length > 1) {
          const reqSize = req.max - req.min + 1;
          assertEquals(tree.branchesLeft(path.slice(0, -1)), reqSize - 1);
        }
      });
    });
    it("removes picks in order", () => {
      const tree = new PickTree();
      const bit = new PickRequest(0, 1);
      assert(tree.prune(playout([bit, bit], [0, 0])));
      assertEquals(tree.branchesLeft([]), 2);
      assert(tree.prune(playout([bit, bit], [0, 1])));
      assertEquals(tree.branchesLeft([]), 1);
      assert(tree.prune(playout([bit, bit], [1, 0])));
      assertEquals(tree.branchesLeft([]), 1);
      assert(tree.prune(playout([bit, bit], [1, 1])));
      assertEquals(tree.branchesLeft([]), 0);
    });
    it("removes three picks from the same node", () => {
      const example = arb.from((pick) => {
        const min = pick(arb.int(0, 2));
        const max = pick(arb.int(min + 2, min + 5));
        const req = arb.int(min, max);
        const first = pick(req);
        const secondArb = req.filter((p) => p !== first);
        const second = pick(secondArb);
        const third = pick(req.filter((p) => p !== first && p !== second));
        return { min, max, picks: [first, second, third] };
      });
      repeatTest(example, ({ min, max, picks }) => {
        const req = new PickRequest(min, max);
        const path = (pick: number) => playout([req], [pick]);
        const tree = new PickTree();
        let expectRemaining = max - min + 1;
        for (const pick of picks) {
          assert(tree.prune(path(pick)));
          expectRemaining--;
          assertEquals(tree.branchesLeft([]), expectRemaining);
        }
        for (const pick of picks) {
          assertFalse(tree.prune(path(pick)));
          assertEquals(tree.branchesLeft([]), expectRemaining);
        }
      });
    });
    it("throws an Error if a PickRequest's range doesn't match the tree", () => {
      const tree = new PickTree();
      const bit = new PickRequest(0, 1);
      assert(tree.prune(playout([bit, bit], [0, 0])));
      const roll = new PickRequest(1, 6);
      assertThrows(
        () => tree.prune(playout([roll], [3])),
        Error,
      );
    });
  });
  describe("branchesLeft", () => {
    const bit = new PickRequest(0, 1);

    it("returns undefined for an unexplored tree", () => {
      const tree = new PickTree();
      assertEquals(tree.branchesLeft([]), undefined);
    });
    it("returns undefined for a path beyond an unexplored tree", () => {
      const tree = new PickTree();
      assertEquals(tree.branchesLeft([0]), undefined);
    });
    it("returns undefined for an unexplored node", () => {
      const tree = new PickTree();
      tree.prune(playout([bit], [0]));
      assertEquals(tree.branchesLeft([1]), undefined);
    });
    it("returns 0 for a pruned tree", () => {
      const tree = new PickTree();
      tree.prune(playout([], []));
      assertEquals(tree.branchesLeft([]), 0);
    });
    it("returns 0 for a path beyond a pruned node", () => {
      const tree = new PickTree();
      tree.prune(playout([], []));
      assertEquals(tree.branchesLeft([0]), 0);
    });
    it("returns the branches left on a root node", () => {
      const tree = new PickTree();
      tree.prune(playout([bit], [0]));
      assertEquals(tree.branchesLeft([]), 1);
    });
  });
});

describe("Walk", () => {
  let tree = new PickTree();
  let walk = tree.walk();

  beforeEach(() => {
    tree = new PickTree();
    walk = tree.walk();
  });

  describe("getReplies", () => {
    it("returns the empty list for a new Walk", () => {
      assertEquals(walk.getReplies().length, 0);
    });
  });
});
