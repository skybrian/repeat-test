import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";

import * as arb from "../src/arbitraries/basics.ts";
import { array } from "../src/arbitraries/arrays.ts";

import { IntRequest, PickList } from "../src/picks.ts";
import { PickTree } from "../src/pick_tree.ts";

function playout(reqs: IntRequest[], replies: number[]) {
  return PickList.wrap(reqs, replies);
}

describe("PickTree", () => {
  describe("prune", () => {
    const bit = new IntRequest(0, 1);
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
        const path = pick(array(arb.int(min, max)));
        return { min, max, path };
      });
      repeatTest(example, ({ min, max, path }) => {
        const tree = new PickTree();
        const req = new IntRequest(min, max);
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
      const bit = new IntRequest(0, 1);
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
        const req = new IntRequest(min, max);
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
    it("throws an Error if an IntRequest's range doesn't match the tree", () => {
      const tree = new PickTree();
      const bit = new IntRequest(0, 1);
      assert(tree.prune(playout([bit, bit], [0, 0])));
      const roll = new IntRequest(1, 6);
      assertThrows(
        () => tree.prune(playout([roll], [3])),
        Error,
      );
    });
  });
  describe("branchesLeft", () => {
    const bit = new IntRequest(0, 1);

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

  describe("pruneBranchTo", () => {
    const req = new IntRequest(1, 5);

    it("creates a node before pruning its lower choices", () => {
      assert(walk.pruneBranchTo(3, req));
      assertEquals(walk.depth, 0);
      assertEquals(tree.branchesLeft([]), 3);
      assertFalse(tree.available([1]));
      assertFalse(tree.available([2]));
      assertEquals(walk.pushUnpruned(req.min, req), 3);

      // Pruning doesn't change the original request range.
      walk.trim(0);
      assertThrows(
        () => walk.pushUnpruned(3, new IntRequest(3, 5)),
        Error,
        "range doesn't match",
      );
    });

    it("prunes an existing node without reviving previously pruned choices", () => {
      walk.push(req, 5);
      walk.prune();
      assert(walk.pruneBranchTo(3, req));
      assertEquals(tree.branchesLeft([]), 2);
      assertEquals(walk.pushUnpruned(1, req), 3);
      assertFalse(tree.available([5]));
    });

    it("handles bounds below the minimum and at the maximum", () => {
      assert(walk.pruneBranchTo(0, req));
      assertEquals(tree.branchesLeft([]), 5);
      assert(walk.pruneBranchTo(req.max, req));
      assertEquals(tree.branchesLeft([]), 1);
      assertEquals(walk.pushUnpruned(req.min, req), req.max);
    });

    it("exhausts the root when the bound exceeds the request", () => {
      assertFalse(walk.pruneBranchTo(6, req));
      assert(tree.done);
      assert(walk.pruned);
      assertEquals(walk.depth, 0);
    });

    it("exhausts an existing node when all its remaining choices are lower", () => {
      walk.push(req, req.max);
      walk.prune();
      assertFalse(walk.pruneBranchTo(req.max, req));
      assert(tree.done);
      assert(walk.pruned);
    });

    it("backs up from an exhausted prefix without pruning its siblings", () => {
      const bit = new IntRequest(0, 1);
      walk.push(bit, 0);
      walk.push(bit, 0);
      assertFalse(walk.pruneBranchTo(6, req));
      assertEquals(walk.getReplies(), [0]);
      assertFalse(tree.available([0, 0]));
      assert(tree.available([0, 1]));
      assert(tree.available([1]));
      assertEquals(walk.pushUnpruned(0, bit), 1);
    });

    it("backs up through empty ancestors", () => {
      const bit = new IntRequest(0, 1);
      walk.push(bit, 0);
      walk.push(new IntRequest(0, 0), 0);
      assertFalse(walk.pruneBranchTo(6, req));
      assertEquals(walk.getReplies(), []);
      assertFalse(tree.available([0]));
      assert(tree.available([1]));
      assertEquals(walk.pushUnpruned(0, bit), 1);
    });

    it("checks an existing range even when the bound would exhaust it", () => {
      assert(walk.pruneBranchTo(3, req));
      assertThrows(
        () => walk.pruneBranchTo(6, new IntRequest(1, 4)),
        Error,
        "range doesn't match",
      );
      assertEquals(tree.branchesLeft([]), 3);
    });
  });

  describe("firstUnprunedInRange", () => {
    it("returns the minimum value for an unexplored tree", () => {
      assertEquals(walk.firstUnprunedInRange(0, 1), 0);
    });
    it("returns the minmum value from the tree", () => {
      tree.walk().push(new IntRequest(1, 2), 0);
      assertEquals(tree.walk().firstUnprunedInRange(0, 1), 1);
    });
    it("returns undefined if all overlapping values were pruned", () => {
      const bit = new IntRequest(0, 1);
      tree.walk().push(bit, 1);
      assert(tree.prune(playout([bit], [1])));
      assertEquals(tree.walk().firstUnprunedInRange(1, 2), undefined);
    });
    it("returns undefined if there is no overlap", () => {
      const bit = new IntRequest(0, 1);
      tree.walk().push(bit, 1);
      assertEquals(tree.walk().firstUnprunedInRange(2, 3), undefined);
    });
  });
});
