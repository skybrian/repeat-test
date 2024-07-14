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
import { PlayoutPruned, RetryPicker } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";

import {
  breadthFirstSearch,
  BreadthFirstSearchOpts,
  Cursor,
  depthFirstSearch,
  SearchOpts,
  SearchTree,
} from "../src/search_tree.ts";
import Arbitrary from "../src/arbitrary_class.ts";

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
          assertEquals(p.maybePick(new PickRequest(0, 3)), count);
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
    it("takes a pick from the underlying picker", () => {
      const tree = new SearchTree(1);
      const picker = tree.makePicker(alwaysPickDefault);
      assert(picker !== undefined);
      assertEquals(picker.maybePick(bit), 0);
      assertEquals(picker.depth, 1);
      assertEquals(picker.getPicks(), [0]);
      assert(picker.tracked);
    });

    it("requires the same range as last time", () => {
      const tree = new SearchTree(1);
      const picker = tree.makePicker(alwaysPickDefault);
      assert(picker !== undefined);
      assertEquals(picker.maybePick(bit), 0);
      picker.backTo(0);
      assertThrows(() => picker.maybePick(new PickRequest(-1, 0)), Error);
    });

    const uint32 = new PickRequest(0, 2 ** 32 - 1);

    describe("when using a non-random underlying picker", () => {
      it("continues tracking beneath a wide node", () => {
        const tree = new SearchTree(1);
        const picker = tree.makePicker(alwaysPickDefault);
        assert(picker !== undefined);
        picker.maybePick(uint32);
        assert(picker.tracked);
      });
    });

    describe("when using a random underlying picker", () => {
      it("stops tracking if there aren't enough playouts to get to every branch", () => {
        const tree = new SearchTree(1);
        const picker = tree.makePicker(randomPicker(123));
        assert(picker !== undefined);
        picker.maybePick(new PickRequest(1, 6));
        assertFalse(picker.tracked);
      });

      it("tracks if there are enough playouts to get to every branch", () => {
        const example = arb.record({
          "playouts": arb.int(2, 1000),
        });
        repeatTest(example, ({ playouts }) => {
          const tree = new SearchTree(playouts);
          const picker = tree.makePicker(randomPicker(123));
          assert(picker !== undefined);
          picker.maybePick(new PickRequest(1, playouts));
          assert(picker.tracked);
        });
      });

      it("doesn't track a very wide node", () => {
        assertEquals(uint32.size, 2 ** 32);

        repeatTest(
          arb.of(0, 1, 1000, 10 ** 6, 10 ** 9, 2 ** 30),
          (playouts) => {
            const tree = new SearchTree(playouts);
            const picker = tree.makePicker(randomPicker(123));
            assert(picker !== undefined);
            picker.maybePick(uint32);
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
          if (picker.maybePick(bit)) {
            picker.maybePick(new PickRequest(1, 2 ** 40));
            counts.other++;
          } else {
            picker.maybePick(new PickRequest(1, 2));
            counts.constants++;
          }
          picker.backTo(0);
        }

        assertEquals(counts, {
          constants: 2,
          other: 998,
        });
      });

      it("picks using a replaced request", () => {
        const tree = new SearchTree(1000);
        const picker = tree.makePicker(alwaysPickMin, {
          replaceRequest: (req) => new PickRequest(req.default, req.default),
        });
        assert(picker !== undefined);

        assertEquals(
          picker.maybePick(new PickRequest(0, 1, { default: 1 })),
          1,
        );
        assertFalse(picker.backTo(0));
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

      it("ends the search when the root has no other children", () => {
        picker.maybePick(new PickRequest(0, 1));
        assert(picker.backTo(0));
        picker.maybePick(new PickRequest(0, 1));
        assertFalse(picker.backTo(0));
      });

      it("starts a new playout when there's a fork", () => {
        picker.maybePick(bit);
        assert(picker.backTo(0));
        assertEquals(picker.depth, 0);
        assertEquals(picker.getPicks(), []);
      });

      it("goes to a different child after a fork", () => {
        picker.maybePick(bit);
        picker.backTo(0);
        assertEquals(picker.maybePick(bit), 1);
      });

      it("ends the search when both sides of a fork were visited", () => {
        picker.maybePick(bit);
        picker.backTo(0);
        picker.maybePick(bit);
        assertFalse(picker.backTo(0));
      });

      it("goes back to a non-zero level", () => {
        picker.maybePick(bit);
        picker.maybePick(bit);
        picker.backTo(1);
        assertEquals(picker.depth, 1);
      });

      it("goes to a different child after going back to a non-zero level", () => {
        picker.maybePick(bit);
        picker.maybePick(bit);
        picker.backTo(1);

        assertEquals(picker.maybePick(bit), 1);
        assertFalse(
          picker.backTo(1),
          "should fail because picks are exhausted",
        );
        assert(picker.backTo(0));
      });
    });

    it("skips a filtered-out branch", () => {
      const tree = new SearchTree(1000);
      const picker = tree.makePicker(alwaysPickMin, {
        replaceRequest: (req) => new PickRequest(req.default, req.default),
      });
      assert(picker !== undefined);

      assertEquals(picker.maybePick(new PickRequest(0, 1, { default: 0 })), 0);
      assertFalse(picker.backTo(0));
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
          const pick = picker.maybePick(digit);
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

type Tree<T> = {
  val: T;
  children: Tree<T>[];
};

const childCount = Arbitrary.of(0, 0, 0, 0, 1, 2, 3);

const anyTree = Arbitrary.from((pick) => {
  let next = 0;
  function pickTree(): Tree<number> {
    const val = next++;
    const children: Tree<number>[] = [];
    const count = pick(childCount);
    for (let i = 0; i < count; i++) {
      children.push(pickTree());
    }
    return { val, children };
  }
  return pickTree();
});

function treeSize(tree: Tree<unknown>): number {
  let size = 1;
  for (const child of tree.children) {
    size += treeSize(child);
  }
  return size;
}

function randomWalk<T>(tree: Tree<T>, picker: RetryPicker): T {
  while (
    tree.children.length > 0
  ) {
    const pick = picker.maybePick(new PickRequest(0, tree.children.length));
    if (pick === tree.children.length) {
      return tree.val;
    }
    tree = tree.children[pick];
  }
  return tree.val;
}

class Maze<T> {
  accepted = new Map<string, T>();
  rejected = new Map<string, T>();
  pruneCount = 0;

  constructor(readonly tree: Tree<T>) {}

  visit(picker: RetryPicker) {
    try {
      const val = randomWalk(this.tree, picker);
      const picks = JSON.stringify(picker.getPicks());
      if (picker.finishPlayout()) {
        this.accepted.set(picks, val);
      } else {
        this.rejected.set(picks, val);
      }
    } catch (e) {
      if (e instanceof PlayoutPruned) {
        this.pruneCount++;
      } else {
        throw e;
      }
    }
  }

  get leaves() {
    return Array.from(this.accepted.values());
  }

  static depthFirstSearch<T>(tree: Tree<T>, opts: SearchOpts) {
    const maze = new Maze(tree);
    for (const picker of depthFirstSearch(opts)) {
      maze.visit(picker);
    }
    return maze;
  }

  static breadthFirstSearch<T>(tree: Tree<T>, opts?: BreadthFirstSearchOpts) {
    const maze = new Maze(tree);
    for (const picker of breadthFirstSearch(opts)) {
      maze.visit(picker);
    }
    return maze;
  }
}

describe("depthFirstSearch", () => {
  const tree = {
    val: "a",
    children: [
      {
        val: "b",
        children: [{ val: "d", children: [] }],
      },
      {
        val: "c",
        children: [],
      },
    ],
  };
  it("filters by request depth", () => {
    const maze = Maze.depthFirstSearch(tree, {
      replaceRequest: (req, depth) => depth < 1 ? req : undefined,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[1]", "[2]"]);
    assertEquals(Array.from(maze.rejected.keys()), []);
    assertEquals(maze.pruneCount, 1);
  });
  it("filters by playout depth", () => {
    const maze = Maze.depthFirstSearch(tree, {
      acceptPlayout: (depth) => depth === 1,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[1]", "[2]"]);
    assertEquals(Array.from(maze.rejected.keys()), ["[0,0]", "[0,1]"]);
    assertEquals(maze.pruneCount, 0);

    const maze2 = Maze.depthFirstSearch(tree, {
      acceptPlayout: (depth) => depth === 2,
    });
    assertEquals(Array.from(maze2.accepted.keys()), ["[0,0]", "[0,1]"]);
    assertEquals(Array.from(maze2.rejected.keys()), ["[1]", "[2]"]);
    assertEquals(maze.pruneCount, 0);
  });
});

describe("breadthFirstSearch", () => {
  it("iterates once when there aren't any branches", () => {
    let count = 0;
    for (const picker of breadthFirstSearch()) {
      assert(picker.finishPlayout());
      count++;
    }
    assertEquals(count, 1);
  });
  it("visits each root branch once", () => {
    const accepted = new Set<string>();
    for (const picker of breadthFirstSearch()) {
      picker.maybePick(new PickRequest(0, 2));
      if (picker.finishPlayout()) {
        accepted.add(JSON.stringify(picker.getPicks()));
      }
    }
    assertEquals(Array.from(accepted), ["[0]", "[1]", "[2]"]);
  });
  it("visits each child branch once", () => {
    const example = arb.record({
      tree: anyTree,
      startDepth: Arbitrary.of(0, 1, 2, 3),
    });
    repeatTest(example, ({ tree, startDepth }) => {
      const size = treeSize(tree);
      const expectedLeaves = Array(size).fill(0).map((_, i) => i);

      const maze = Maze.breadthFirstSearch(tree, { startDepth });
      const actualLeaves = maze.leaves;
      actualLeaves.sort((a, b) => a - b);

      assertEquals(expectedLeaves, actualLeaves);
    });
  });
});
