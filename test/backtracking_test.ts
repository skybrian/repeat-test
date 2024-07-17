import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { alwaysPickMin, PickRequest } from "../src/picks.ts";
import { onePlayoutPicker, rotatePicks } from "../src/backtracking.ts";
import { breadthFirstSearch, depthFirstSearch } from "../src/search_tree.ts";

const bit = new PickRequest(0, 1);

describe("onePlayoutPicker", () => {
  it("records one playout", () => {
    const picker = onePlayoutPicker(randomPicker(123));
    const first = picker.maybePick(bit);
    const second = picker.maybePick(bit);
    assertEquals(picker.getPicks(), [first, second]);
    assertEquals(picker.depth, 2);
    assertEquals(picker.backTo(0), false);
  });
});

describe("rotatePicks", () => {
  it("returns the new defaults instead of a minimum value", () => {
    const picker = rotatePicks(onePlayoutPicker(alwaysPickMin), [1, 2]);

    assertEquals(picker.maybePick(new PickRequest(0, 1)), 1);
    assertEquals(picker.depth, 1);
    assertEquals(picker.getPicks(), [1]);

    assertEquals(picker.maybePick(new PickRequest(0, 10)), 2);
    assertEquals(picker.depth, 2);
    assertEquals(picker.getPicks(), [1, 2]);

    assertEquals(picker.maybePick(new PickRequest(5, 6)), 5);
    assertEquals(picker.depth, 3);
    assertEquals(picker.getPicks(), [1, 2, 5]);
  });
  it("works with depth-first search", () => {
    const bit = new PickRequest(0, 1);
    const playouts: string[] = [];
    for (let picker of depthFirstSearch()) {
      picker = rotatePicks(picker, [1, 1]);
      for (let i = 0; i < 3; i++) {
        picker.maybePick(bit);
      }
      assertEquals(picker.depth, 3);
      playouts.push(JSON.stringify(picker.getPicks()));
    }
    assertEquals(playouts, [
      "[1,1,0]",
      "[1,1,1]",
      "[1,0,0]",
      "[1,0,1]",
      "[0,1,0]",
      "[0,1,1]",
      "[0,0,0]",
      "[0,0,1]",
    ]);
  });
  it("works with breadth-first search", () => {
    const bit = new PickRequest(0, 1);
    const playouts: string[] = [];
    for (let picker of breadthFirstSearch()) {
      picker = rotatePicks(picker, [1, 1]);
      for (let i = 0; i < 3; i++) {
        picker.maybePick(bit);
      }
      assertEquals(picker.depth, 3);
      if (picker.finishPlayout()) {
        playouts.push(JSON.stringify(picker.getPicks()));
      }
    }
    assertEquals(playouts, [
      "[1,1,0]",
      "[0,1,0]",
      "[1,0,0]",
      "[0,0,0]",
      "[1,1,1]",
      "[1,0,1]",
      "[0,1,1]",
      "[0,0,1]",
    ]);
  });
});
