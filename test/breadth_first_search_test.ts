import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows, fail } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import { PlayoutSource, Pruned } from "../src/backtracking.ts";

import Arbitrary from "../src/arbitrary_class.ts";
import { repeatTest } from "../src/runner.ts";

import { assertGenerated, assertValues } from "../src/asserts.ts";
import {
  BreadthFirstSearch,
  configurePass,
  find,
  generateAll,
  takeAll,
  takeGenerated,
} from "../src/breadth_first_search.ts";
import { Success, success } from "../src/results.ts";

const bit = new PickRequest(0, 1);

const one = new PickRequest(1, 1);

function walkUnaryTree(playouts: PlayoutSource): string | undefined {
  assert(playouts.startAt(0));
  let result = "";
  for (let i = 0; i < 8; i++) {
    const pick = playouts.nextPick(one);
    if (!pick.ok) {
      return undefined;
    }
    if (pick.val) {
      result += "1";
    } else {
      result += "0";
    }
  }
  if (!playouts.endPlayout()) {
    return undefined;
  }
  return result;
}

function walkBinaryTree(...stops: string[]) {
  function walk(playouts: PlayoutSource): string | undefined {
    assert(playouts.startAt(0));
    let result = "";
    for (let i = 0; i < 8; i++) {
      if (stops.includes(result)) {
        if (!playouts.endPlayout()) {
          return undefined;
        }
        return result;
      }
      const pick = playouts.nextPick(bit);
      if (!pick.ok) {
        return undefined;
      }
      if (pick.val) {
        result += "1";
      } else {
        result += "0";
      }
    }
    if (!playouts.endPlayout()) {
      return undefined;
    }
    return result;
  }
  return walk;
}

function runPass(
  idx: number,
  walk: (playouts: PlayoutSource) => string | undefined,
) {
  const playouts = new Set<string>();
  let pruneCalls = 0;
  let prunedPlayouts = 0;
  const search = new BreadthFirstSearch();
  search.search = configurePass(idx, () => {
    pruneCalls++;
  });
  while (!search.done) {
    try {
      const playout = walk(search);
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

describe("configurePass", () => {
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
  playouts: PlayoutSource,
): Success<T> | Pruned {
  while (
    tree.children.length > 0
  ) {
    const pick = playouts.nextPick(new PickRequest(0, tree.children.length));
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

  visit(playouts: PlayoutSource) {
    while (playouts.startAt(0)) {
      const val = randomWalk(this.tree, playouts);
      if (!val.ok) {
        this.pruneCount++;
        continue;
      }
      const picks = JSON.stringify(playouts.getPicks().replies());
      if (playouts.endPlayout()) {
        if (this.accepted.has(picks)) {
          fail(`duplicate picks: ${picks}`);
        }
        this.accepted.set(picks, val.val);
      } else {
        this.rejected.set(picks, val.val);
      }
    }
  }

  get leaves() {
    const result = Array.from(this.accepted.values());
    result.sort((a, b) => a - b);
    return result;
  }
}

describe("BreadthFirstSearch", () => {
  let search = new BreadthFirstSearch();

  beforeEach(() => {
    search = new BreadthFirstSearch();
  });

  it("generates one playout when there aren't any branches", () => {
    assert(search.startAt(0));
    assert(search.endPlayout());
    assert(search.done);
  });

  it("visits each root branch once", () => {
    const accepted = new Set<string>();
    while (!search.done) {
      assert(search.startAt(0));
      search.nextPick(new PickRequest(0, 2));
      const picks = search.getPicks();
      if (search.endPlayout()) {
        accepted.add(JSON.stringify(picks.replies()));
      }
    }
    assertEquals(Array.from(accepted), ["[0]", "[1]", "[2]"]);
  });
  it("visits each child branch once", () => {
    repeatTest(anyTree, (tree) => {
      const expectedLeaves = Array(tree.size).fill(0).map((_, i) => i);

      const maze = new Maze(tree);
      const search = new BreadthFirstSearch();
      while (!search.done) {
        maze.visit(search);
      }
      assertEquals(expectedLeaves, maze.leaves);
    }, { reps: 100 });
  });
});

describe("takeGenerated", () => {
  it("generates a single value for a constant", () => {
    const one = Arbitrary.from(() => 1);
    assertGenerated(one, [{ val: 1, picks: [] }]);
  });

  it("generates a valid PickRequest for an array of examples", () => {
    const examples = Arbitrary.of(1, 2, 3);
    const gens = takeGenerated(examples, 4);
    const reqs = gens[0].picks().reqs();
    assertEquals(reqs.length, 1);
    assertEquals(reqs[0].min, 0);
    assertEquals(reqs[0].max, 2);
  });

  it("generates a single value for a filtered constant", () => {
    const one = Arbitrary.from(() => 1).filter((val) => val === 1);
    assertGenerated(one, [{ val: 1, picks: [] }]);
  });

  it("generates each value an integer range", () => {
    const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
    assertGenerated(oneTwoThree, [
      { val: 1, picks: [1] },
      { val: 2, picks: [2] },
      { val: 3, picks: [3] },
    ]);
  });

  it("generates both values for a boolean", () => {
    const boolean = Arbitrary.from(new PickRequest(0, 1)).map((b) => b === 1);
    assertGenerated(boolean, [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });

  it("generates the accepted values from a filter", () => {
    const bit = Arbitrary.from(new PickRequest(0, 1))
      .filter((b) => b === 0);
    assertGenerated(bit, [
      { val: 0, picks: [0] },
    ]);
  });

  it("generates every combination for an odometer", () => {
    const digit = new PickRequest(0, 9);
    const digits = Arbitrary.from((pick) => {
      const a = pick(digit);
      const b = pick(digit);
      const c = pick(digit);
      return a * 100 + b * 10 + c;
    });

    const vals = Array.from(generateAll(digits));
    assertEquals(vals[0].val, 0);
    assertEquals(vals[0].replies(), [0, 0, 0]);
    assertEquals(vals[999].val, 999);
    assertEquals(vals[999].replies(), [9, 9, 9]);
  });
});

describe("find", () => {
  const letters = Arbitrary.of("a", "b", "c");
  it("finds a generated value", () => {
    const gen = find(letters, (v) => v === "b");
    assert(gen !== undefined);
    assertEquals(gen.val, "b");
  });
  it("throws if it doesn't find it", () => {
    assertEquals(find(letters, (v) => v === "d"), undefined);
  });
  it("throws if it doesn't find it within the limit", () => {
    const letters = Arbitrary.of("a", "b", "c");
    assertThrows(
      () => find(letters, (v) => v === "c", { limit: 2 }),
      Error,
      "findBreadthFirst for '3 examples': no match found in the first 2 values",
    );
  });
});

describe("takeAll", () => {
  it("returns the only value of a constant", () => {
    const one = Arbitrary.from(() => 1);
    assertValues(one, [1]);
  });

  const bit = Arbitrary.from(new PickRequest(0, 1));
  it("returns both bit values", () => {
    assertValues(bit, [0, 1]);
  });

  it("handles a mapped Arbitrary", () => {
    const bool = bit.map((b) => b == 1);
    assertValues(bool, [false, true]);
  });

  it("handles PlayoutPruned", () => {
    const notTwo = Arbitrary.from((pick) => {
      const n = pick(new PickRequest(1, 3));
      if (n === 2) throw new Pruned("skip 2");
      return n;
    });
    assertValues(notTwo, [1, 3]);
  });

  it("handles a filtered Arbitrary", () => {
    const zero = bit.filter((b) => b === 0);
    assertValues(zero, [0]);
  });

  it("handles a chained Arbitrary", () => {
    const hello = bit.chain((val) => {
      if (val === 1) {
        return Arbitrary.from(() => "there");
      } else {
        return Arbitrary.from(() => "hi");
      }
    });
    assertValues(hello, ["hi", "there"]);
  });

  it("generates all values for a combination lock", () => {
    const digit = new PickRequest(1, 9);
    const digitCount = 3;
    const accepted = new Set(["[1,2,3]", "[1,4,3]"]);

    const digits = Arbitrary.from((pick) => {
      const picks: number[] = [];
      for (let i = 0; i < digitCount; i++) {
        picks.push(pick(digit));
      }
      return JSON.stringify(picks);
    });
    const lock = digits.filter((pick) => accepted.has(pick));
    assertValues(lock, [
      "[1,2,3]",
      "[1,4,3]",
    ]);
  });

  it("throws an exception if it can't find a value", () => {
    const letters = Arbitrary.of("a", "b", "c");
    assertThrows(
      () => takeAll(letters, { limit: 2 }),
      Error,
      "takeAllBreadthFirst for '3 examples': array would have more than 2 elements",
    );
  });
});
