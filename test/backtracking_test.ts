import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { alwaysPickMin, PickRequest } from "../src/picks.ts";
import { onePlayoutPicker, rotatePicks } from "../src/backtracking.ts";
import { breadthFirstSearch, depthFirstSearch } from "../src/search_tree.ts";

const bit = new PickRequest(0, 1);

describe("onePlayoutPicker", () => {
  it("records one playout", () => {
    const picker = onePlayoutPicker(randomPicker(123));
    const first = picker.maybePick(bit);
    assert(first.ok);
    const second = picker.maybePick(bit);
    assert(second.ok);
    assertEquals(picker.getPicks().reqs(), [bit, bit]);
    assertEquals(picker.getPicks().replies(), [first.val, second.val]);
    assertEquals(picker.depth, 2);
    assertEquals(picker.backTo(0), false);
  });
});

describe("rotatePicks", () => {
  it("returns the new defaults instead of a minimum value", () => {
    const picker = rotatePicks(onePlayoutPicker(alwaysPickMin), [1, 2]);

    const bit = new PickRequest(0, 1);
    assertEquals(picker.maybePick(bit), { ok: true, val: 1 });
    assertEquals(picker.depth, 1);
    assertEquals(picker.getPicks().reqs(), [bit]);
    assertEquals(picker.getPicks().replies(), [1]);

    const d10 = new PickRequest(1, 10);
    assertEquals(picker.maybePick(d10), { ok: true, val: 2 });
    assertEquals(picker.depth, 2);
    assertEquals(picker.getPicks().reqs(), [bit, d10]);
    assertEquals(picker.getPicks().replies(), [1, 2]);

    const req56 = new PickRequest(5, 6);
    assertEquals(picker.maybePick(req56), { ok: true, val: 5 });
    assertEquals(picker.depth, 3);
    assertEquals(picker.getPicks().reqs(), [bit, d10, req56]);
    assertEquals(picker.getPicks().replies(), [1, 2, 5]);
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
      playouts.push(JSON.stringify(picker.getPicks().replies()));
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
        playouts.push(JSON.stringify(picker.getPicks().replies()));
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
