import type { Tracker } from "../src/backtracking.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows, fail } from "@std/assert";

import { Arbitrary } from "@/arbitrary.ts";

import { Pruned } from "../src/pickable.ts";
import { PickRequest } from "../src/picks.ts";
import { Script } from "../src/build.ts";

import { assertGenerated, assertValues } from "./lib/asserts.ts";
import {
  find,
  generateAll,
  orderedPlayouts,
  OrderedTracker,
  take,
  takeAll,
  takeGenerated,
} from "../src/ordered.ts";
import { arb } from "@/mod.ts";

class Playouts {
  playoutToPass = new Map<string, number>();

  add(playout: string, pass: number) {
    if (playout === undefined) {
      return;
    }
    if (this.playoutToPass.has(playout)) {
      fail(`duplicate playout: ${playout}`);
    }
    this.playoutToPass.set(playout, pass);
  }

  toRecord(): Record<number, string[]> {
    const result: Record<number, string[]> = {};
    for (const [playout, pass] of this.playoutToPass.entries()) {
      if (result[pass] === undefined) {
        result[pass] = [];
      }
      result[pass].push(playout);
    }
    return result;
  }
}

type WalkFunction = (playouts: Tracker) => string | undefined;

function walkFunction(
  width: number,
  depth: number,
  ...solutions: string[]
): WalkFunction {
  const branch = new PickRequest(0, width - 1);

  function walk(tracker: Tracker): string | undefined {
    tracker.startPlayout(0);
    let result = "";
    for (let i = 0; i < depth; i++) {
      if (solutions.includes(result)) {
        break;
      }
      const pick = tracker.maybePick(branch);
      if (pick === undefined) {
        return undefined;
      }
      if (width > 10 && result.length > 0) {
        result += ",";
      }
      result += pick;
    }
    return result;
  }
  return walk;
}

function runSearch(
  walk: WalkFunction,
  maxPasses?: number,
): Record<string, string[]> {
  const playouts = new Playouts();

  const tracker = new OrderedTracker(maxPasses);
  do {
    try {
      const playout = walk(tracker);
      if (playout !== undefined) {
        playouts.add(playout, tracker.currentPass);
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  } while (tracker.nextPlayout() !== undefined);
  return playouts.toRecord();
}

describe("OrderedTracker", () => {
  it("visits each root branch once", () => {
    assertEquals(runSearch(walkFunction(2, 1)), {
      0: ["0"],
      1: ["1"],
    });
  });
  it("handles a binary tree of depth 5", () => {
    assertEquals(runSearch(walkFunction(2, 5)), {
      0: ["00000"],
      1: ["10000"],
      2: ["01000", "11000"],
      3: ["00100", "01100", "10100", "11100"],
      4: [
        "00010",
        "00110",
        "01010",
        "01110",
        "10010",
        "10110",
        "11010",
        "11110",
      ],
      5: [
        "00001",
        "00011",
        "00101",
        "00111",
        "01001",
        "01011",
        "01101",
        "01111",
        "10001",
        "10011",
        "10101",
        "10111",
        "11001",
        "11011",
        "11101",
        "11111",
      ],
    });
  });
  it("handles a three-way tree", () => {
    assertEquals(runSearch(walkFunction(3, 3)), {
      0: ["000"],
      1: ["100"],
      2: ["010", "110", "200", "210"],
      3: [
        "001",
        "011",
        "020",
        "021",
        "101",
        "111",
        "120",
        "121",
        "201",
        "211",
        "220",
        "221",
      ],
      4: [
        "002",
        "012",
        "022",
        "102",
        "112",
        "122",
        "202",
        "212",
        "222",
      ],
    });
  });
  it("gradually widens a 100-way search", () => {
    assertEquals(runSearch(walkFunction(100, 2), 5), {
      0: ["0,0"],
      1: ["1,0"],
      2: ["0,1", "1,1", "2,0", "2,1"],
      3: ["0,2", "1,2", "2,2", "3,0", "3,1", "3,2"],
      4: [
        "0,3",
        "1,3",
        "2,3",
        "3,3",
        "4,0",
        "4,1",
        "4,2",
        "4,3",
      ],
    });
  });
  it("gradually widens a 1000-way search", () => {
    assertEquals(runSearch(walkFunction(1000, 1), 5), {
      0: ["0"],
      1: ["1"],
      2: ["2"],
      3: ["3"],
      4: ["4"],
    });
  });
});

describe("orderedPlayouts", () => {
  let stream = orderedPlayouts();

  beforeEach(() => {
    stream = orderedPlayouts();
  });

  it("generates one playout when there aren't any branches", () => {
    assert(stream.startAt(0));
    stream.endPlayout();
    assert(stream.done);
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
    assertEquals(gens.length, 3);
    const playout = gens[0].picks;
    assertEquals(playout.length, 1);
    const req = playout.getPick(0).req;
    assertEquals(req.min, 0);
    assertEquals(req.max, 2);
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

  it("works for a oneOf", () => {
    const overlap = arb.oneOf(arb.of(1, 2), arb.of(2, 3));
    assertGenerated(overlap, [
      { val: 1, picks: [0, 0] },
      { val: 2, picks: [1, 0] },
      { val: 2, picks: [0, 1] },
      { val: 3, picks: [1, 1] },
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
    assertEquals(vals[0].replies, [0, 0, 0]);
    assertEquals(vals[999].val, 999);
    assertEquals(vals[999].replies, [9, 9, 9]);
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
      "find for '3 examples': no match found in the first 2 values",
    );
  });
});

describe("take", () => {
  const one = Arbitrary.from(() => 1);
  it("returns the only value of a constant", () => {
    assertEquals(take(one, 2), [1]);
  });

  it("returns the shortest arrays of ones", () => {
    assertEquals(take(arb.array(one), 5), [
      [],
      [1],
      [1, 1],
      [1, 1, 1],
      [1, 1, 1, 1],
    ]);
  });

  it("returns pairs of arrays of ones", () => {
    const pair = arb.array(arb.array(one), { length: 2 });
    assertEquals(take(pair, 6), [
      [[], []],
      [[1], []],
      [[], [1]],
      [[1, 1], []],
      [[], [1, 1]],
      [[1], [1]],
    ]);
  });

  it("works for a two-step build script", () => {
    const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

    const twoBits = bit.then("twoBits", (a, pick) => {
      const b = pick(PickRequest.bit);
      return [a, b];
    });

    assertEquals(take(twoBits, 5), [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it("works for a oneOf", () => {
    const overlap = arb.oneOf(arb.of(1, 2), arb.of(2, 3));
    assertEquals(take(overlap, 5), [1, 2, 2, 3]);
  });

  it("throws if the build function throws", () => {
    const one = Arbitrary.from((pick) => {
      if (pick(new PickRequest(0, 1)) === 0) return 0;
      throw new Error("oh no!");
    });
    assertThrows(() => take(one, 2), Error, "oh no!");
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

  it("throws an exception if it can't find a value", () => {
    const letters = Arbitrary.of("a", "b", "c");
    assertThrows(
      () => takeAll(letters, { limit: 2 }),
      Error,
      "takeAll for '3 examples': array would have more than 2 elements",
    );
  });
});
