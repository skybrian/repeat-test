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

import { alwaysPick, alwaysPickMin, PickRequest } from "../src/picks.ts";
import { Pruned, RetryPicker } from "../src/backtracking.ts";
import { randomPicker } from "../src/random.ts";

import {
  breadthFirstPass,
  breadthFirstSearch,
  Cursor,
  depthFirstSearch,
  SearchOpts,
  SearchTree,
} from "../src/search_tree.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { Success, success } from "../src/results.ts";

const bit = new PickRequest(0, 1);

describe("SearchTree", () => {
  describe("makePicker", () => {
    it("starts a playout with no picks", () => {
      const search = new SearchTree(1);
      const picker = search.makePicker(alwaysPickMin);
      assert(picker !== undefined);
      assertEquals(picker.depth, 0);
      assertEquals(picker.getPicks().reqs(), []);
      assertEquals(picker.getPicks().replies(), []);
      assert(picker.tracked);
    });
  });

  describe("pickers", () => {
    it("starts a new playout each time", () => {
      const search = new SearchTree(4);

      let count = 0;
      for (let i = 0; i < 2; i++) {
        const pickers = search.pickers(alwaysPickMin);
        for (const p of pickers) {
          assertEquals(p.depth, 0);
          assertEquals(p.maybePick(new PickRequest(0, 3)), {
            ok: true,
            val: count,
          });
          assertEquals(p.depth, 1);
          count++;
          if (count % 2 == 0) break;
        }
      }
      const empty = search.pickers(alwaysPickMin);
      assert(empty.next().done);
      assertEquals(count, 4);
    });
  });

  describe("searchDone", () => {
    it("returns false by default", () => {
      const search = new SearchTree(1);
      assertFalse(search.searchDone);
    });
  });
});

describe("Cursor", () => {
  describe("pick", () => {
    it("takes a pick from the underlying picker", () => {
      const search = new SearchTree(1);
      const picker = search.makePicker(alwaysPickMin);
      assert(picker !== undefined);
      assertEquals(picker.maybePick(bit), { ok: true, val: 0 });
      assertEquals(picker.depth, 1);
      assertEquals(picker.getPicks().reqs(), [bit]);
      assertEquals(picker.getPicks().replies(), [0]);
      assert(picker.tracked);
    });

    it("requires the same range as last time", () => {
      const search = new SearchTree(1);
      const picker = search.makePicker(alwaysPickMin);
      assert(picker !== undefined);
      assertEquals(picker.maybePick(bit), { ok: true, val: 0 });
      picker.backTo(0);
      assertThrows(() => picker.maybePick(new PickRequest(-1, 0)), Error);
    });

    const uint32 = new PickRequest(0, 2 ** 32 - 1);

    describe("when using a non-random underlying picker", () => {
      it("continues tracking beneath a wide node", () => {
        const search = new SearchTree(1);
        const picker = search.makePicker(alwaysPickMin);
        assert(picker !== undefined);
        picker.maybePick(uint32);
        assert(picker.tracked);
      });
    });

    describe("when using a random underlying picker", () => {
      it("stops tracking if there aren't enough playouts to get to every branch", () => {
        const search = new SearchTree(1);
        const picker = search.makePicker(randomPicker(123));
        assert(picker !== undefined);
        picker.maybePick(new PickRequest(1, 6));
        assertFalse(picker.tracked);
      });

      it("tracks if there are enough playouts to get to every branch", () => {
        const example = arb.record({
          "playouts": arb.int(2, 1000),
        });
        repeatTest(example, ({ playouts }) => {
          const search = new SearchTree(playouts);
          const picker = search.makePicker(randomPicker(123));
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
            const search = new SearchTree(playouts);
            const picker = search.makePicker(randomPicker(123));
            assert(picker !== undefined);
            picker.maybePick(uint32);
            assertFalse(picker.tracked);
          },
        );
      });

      it("doesn't revisit a constant in an unbalanced tree", () => {
        const search = new SearchTree(1000);
        const picker = search.makePicker(randomPicker(123));
        assert(picker !== undefined);

        const counts = {
          constants: 0,
          other: 0,
        };
        for (let i = 0; i < 1000; i++) {
          const pick = picker.maybePick(bit);
          assert(pick.ok);
          if (pick.val == 1) {
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
        const search = new SearchTree(1000);
        const picker = search.makePicker(alwaysPickMin, {
          replaceRequest: (_, req) => new PickRequest(req.max, req.max),
        });
        assert(picker !== undefined);

        assertEquals(
          picker.maybePick(new PickRequest(0, 1)),
          { ok: true, val: 1 },
        );
        assertFalse(picker.backTo(0));
      });
    });
  });

  describe("backTo", () => {
    describe("for a depth-first search", () => {
      function makePicker(): Cursor {
        const search = new SearchTree(0);
        const picker = search.makePicker(alwaysPickMin);
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
        assertEquals(picker.getPicks().reqs(), []);
        assertEquals(picker.getPicks().replies(), []);
      });

      it("goes to a different child after a fork", () => {
        picker.maybePick(bit);
        picker.backTo(0);
        assertEquals(picker.maybePick(bit), { ok: true, val: 1 });
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

        assertEquals(picker.maybePick(bit), { ok: true, val: 1 });
        assertFalse(
          picker.backTo(1),
          "should fail because picks are exhausted",
        );
        assert(picker.backTo(0));
      });
    });

    it("skips a filtered-out branch", () => {
      const search = new SearchTree(1000);
      const picker = search.makePicker(alwaysPickMin, {
        replaceRequest: (_, req) => new PickRequest(req.min, req.min),
      });
      assert(picker !== undefined);

      assertEquals(picker.maybePick(new PickRequest(0, 1)), {
        ok: true,
        val: 0,
      });
      assertFalse(picker.backTo(0));
    });
  });

  it("fully explores a combination lock", () => {
    const underlyingPickers = arb.oneOf([
      arb.of(
        alwaysPickMin,
        alwaysPick(3),
      ),
      arb.int32().map((seed) => randomPicker(seed)),
    ]);

    repeatTest(underlyingPickers, (underlying) => {
      const digit = new PickRequest(0, 9);
      const search = new SearchTree(2000);
      const picker = search.makePicker(underlying);
      assert(picker !== undefined);

      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const picks: number[] = [];
        for (let j = 0; j < 3; j++) {
          const pick = picker.maybePick(digit);
          assert(pick.ok);
          picks.push(pick.val);
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
      if (underlying === alwaysPickMin) {
        assertEquals(playouts[0], "[0,0,0]");
        assertEquals(playouts[999], "[9,9,9]");
      }
    }, { reps: 100 });
  });
});

class Tree<T> {
  readonly children: Tree<T>[];
  constructor(readonly val: T, children?: Tree<T>[]) {
    this.children = children ?? [];
  }

  get size(): number {
    let size = 1;
    for (const child of this.children) {
      size += child.size;
    }
    return size;
  }

  toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

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
    return new Tree(val, children);
  }
  const result = pickTree();
  return result;
});

function randomWalk<T>(
  tree: Tree<T>,
  picker: RetryPicker,
): Success<T> | Pruned {
  while (
    tree.children.length > 0
  ) {
    const pick = picker.maybePick(new PickRequest(0, tree.children.length));
    if (!pick.ok) {
      return pick;
    }
    if (pick.val === tree.children.length) {
      return success(tree.val);
    }
    tree = tree.children[pick.val];
  }
  return success(tree.val);
}

class Maze {
  accepted = new Map<string, number>();
  rejected = new Map<string, number>();
  pruneCount = 0;

  constructor(readonly tree: Tree<number>) {}

  visit(picker: RetryPicker) {
    const val = randomWalk(this.tree, picker);
    if (!val.ok) {
      this.pruneCount++;
      return;
    }
    const picks = JSON.stringify(picker.getPicks().replies());
    if (picker.finishPlayout()) {
      if (this.accepted.has(picks)) {
        fail(`duplicate picks: ${picks}`);
      }
      // console.log(`accepted: ${picks} -> ${val}`);
      this.accepted.set(picks, val.val);
    } else {
      // console.log(`rejected: ${picks} -> ${val}`);
      this.rejected.set(picks, val.val);
    }
  }

  get leaves() {
    const result = Array.from(this.accepted.values());
    result.sort((a, b) => a - b);
    return result;
  }

  static depthFirstSearch(tree: Tree<number>, opts: SearchOpts) {
    const maze = new Maze(tree);
    for (const picker of depthFirstSearch(opts)) {
      maze.visit(picker);
    }
    return maze;
  }
}

describe("depthFirstSearch", () => {
  const tree = new Tree(42, [
    new Tree(43, [new Tree(45)]),
    new Tree(44),
  ]);
  it("filters by request depth", () => {
    const maze = Maze.depthFirstSearch(tree, {
      replaceRequest: (depth, req) => depth < 1 ? req : undefined,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[1]", "[2]"]);
    assertEquals(Array.from(maze.rejected.keys()), []);
    assertEquals(maze.pruneCount, 1);
  });
  it("filters by last request depth === 0", () => {
    const maze = Maze.depthFirstSearch(tree, {
      acceptPlayout: (lastDepth) => lastDepth === 0,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[1]", "[2]"]);
    assertEquals(Array.from(maze.rejected.keys()), ["[0,0]", "[0,1]"]);
    assertEquals(maze.pruneCount, 0);
  });
  it("filters by last request depth === 1", () => {
    const maze = Maze.depthFirstSearch(tree, {
      acceptPlayout: (lastDepth) => lastDepth === 1,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[0,0]", "[0,1]"]);
    assertEquals(Array.from(maze.rejected.keys()), ["[1]", "[2]"]);
    assertEquals(maze.pruneCount, 0);
  });
  it("filters by last request size", () => {
    const maze = Maze.depthFirstSearch(tree, {
      acceptPlayout: (_, req) => req.size === 3,
    });
    assertEquals(Array.from(maze.accepted.keys()), ["[1]", "[2]"]);
    assertEquals(Array.from(maze.rejected.keys()), ["[0,0]", "[0,1]"]);
    assertEquals(maze.pruneCount, 0);
  });
});

const one = new PickRequest(1, 1);

function walkUnaryTree(picker: RetryPicker): string | undefined {
  let result = "";
  for (let i = 0; i < 8; i++) {
    const pick = picker.maybePick(one);
    if (!pick.ok) {
      return undefined;
    }
    if (pick.val) {
      result += "1";
    } else {
      result += "0";
    }
  }
  if (!picker.finishPlayout()) {
    return undefined;
  }
  return result;
}

function walkBinaryTree(...stops: string[]) {
  function walk(picker: RetryPicker): string | undefined {
    let result = "";
    for (let i = 0; i < 8; i++) {
      if (stops.includes(result)) {
        if (!picker.finishPlayout()) {
          return undefined;
        }
        return result;
      }
      const pick = picker.maybePick(bit);
      if (!pick.ok) {
        return undefined;
      }
      if (pick.val) {
        result += "1";
      } else {
        result += "0";
      }
    }
    if (!picker.finishPlayout()) {
      return undefined;
    }
    return result;
  }
  return walk;
}

function runPass(
  idx: number,
  walk: (picker: RetryPicker) => string | undefined,
) {
  const playouts = new Set<string>();
  let pruneCalls = 0;
  let prunedPlayouts = 0;
  for (
    const picker of breadthFirstPass(idx, () => {
      pruneCalls++;
    })
  ) {
    try {
      const playout = walk(picker);
      if (playout === undefined) {
        prunedPlayouts++;
        continue;
      }
      if (playouts.has(playout)) {
        fail(`duplicate playout: ${playout}`);
      }
      playouts.add(playout);
    } catch (e) {
      if (e instanceof Pruned) {
        prunedPlayouts++;
        continue;
      }
      throw e;
    }
  }
  return {
    playouts: Array.from(playouts),
    pruneCalls,
    prunedPlayouts,
  };
}

describe("breadthFirstPass", () => {
  describe("for a single-playout tree", () => {
    it("yields the full playout on the first pass", () => {
      assertEquals(runPass(0, walkUnaryTree), {
        playouts: ["11111111"],
        pruneCalls: 1,
        prunedPlayouts: 0,
      });
    });
    it("yields nothing on the second pass", () => {
      assertEquals(runPass(1, walkUnaryTree), {
        playouts: [],
        pruneCalls: 1,
        prunedPlayouts: 1,
      });
    });
  });
  describe("for a binary tree", () => {
    describe("on the first pass", () => {
      it("stops if there's an empty playout", () => {
        assertEquals(runPass(0, walkBinaryTree("")), {
          playouts: [""],
          pruneCalls: 0,
          prunedPlayouts: 0,
        });
      });
      it("can yield a long minimum playout", () => {
        assertEquals(runPass(0, walkBinaryTree()), {
          playouts: ["00000000"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
    });

    describe("on the second pass", () => {
      it("can't yield an empty playout", () => {
        assertEquals(runPass(1, walkBinaryTree("")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 1,
        });
      });
      it("stops for a playout with one pick", () => {
        assertEquals(runPass(1, walkBinaryTree("1")), {
          playouts: ["1"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
      it("can yield a long playout with one non-default pick", () => {
        assertEquals(runPass(1, walkBinaryTree()), {
          playouts: ["10000000"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
    });

    describe("on the third pass", () => {
      it("can't yield an empty playout", () => {
        assertEquals(runPass(2, walkBinaryTree("")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 1,
        });
      });
      it("can't yield playouts with one pick", () => {
        assertEquals(runPass(2, walkBinaryTree("0", "1")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 2,
        });
      });
      it("stops after playouts with two picks", () => {
        assertEquals(runPass(2, walkBinaryTree("01", "11")), {
          playouts: ["01", "11"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
      it("can yield two long playouts", () => {
        assertEquals(runPass(2, walkBinaryTree()), {
          playouts: ["01000000", "11000000"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
    });

    describe("on the fourth pass", () => {
      it("can't yield an empty playout", () => {
        assertEquals(runPass(3, walkBinaryTree("")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 1,
        });
      });
      it("can't yield playouts with one pick", () => {
        assertEquals(runPass(3, walkBinaryTree("0", "1")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 2,
        });
      });
      it("can't yield playouts with two pick", () => {
        assertEquals(runPass(3, walkBinaryTree("00", "01", "10", "11")), {
          playouts: [],
          pruneCalls: 0,
          prunedPlayouts: 4,
        });
      });
      it("stops after playouts with three picks", () => {
        assertEquals(runPass(3, walkBinaryTree("001", "011", "101", "111")), {
          playouts: ["001", "011", "101", "111"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
      it("yields four long playouts", () => {
        assertEquals(runPass(3, walkBinaryTree()), {
          playouts: ["00100000", "01100000", "10100000", "11100000"],
          pruneCalls: 1,
          prunedPlayouts: 0,
        });
      });
    });
    it("yields eight playouts on the fifth pass", () => {
      assertEquals(runPass(4, walkBinaryTree()), {
        playouts: [
          "00010000",
          "00110000",
          "01010000",
          "01110000",
          "10010000",
          "10110000",
          "11010000",
          "11110000",
        ],
        pruneCalls: 1,
        prunedPlayouts: 0,
      });
    });
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
        accepted.add(JSON.stringify(picker.getPicks().replies()));
      }
    }
    assertEquals(Array.from(accepted), ["[0]", "[1]", "[2]"]);
  });
  it("visits each child branch once", () => {
    repeatTest(anyTree, (tree) => {
      const expectedLeaves = Array(tree.size).fill(0).map((_, i) => i);

      const maze = new Maze(tree);
      for (const picker of breadthFirstSearch()) {
        maze.visit(picker);
      }
      assertEquals(expectedLeaves, maze.leaves);
    }, { reps: 100 });
  });
});
