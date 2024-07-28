import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, onePlayout, rotatePicks } from "../src/backtracking.ts";
import { breadthFirstSearch, PlayoutSearch } from "../src/searches.ts";

const bit = new PickRequest(0, 1);

describe("onePlayoutPicker", () => {
  it("records one playout", () => {
    const picker = onePlayout(randomPicker(123));
    assert(picker.startAt(0));
    const first = picker.maybePick(bit);
    assert(first.ok);
    const second = picker.maybePick(bit);
    assert(second.ok);
    assertEquals(picker.getPicks().reqs(), [bit, bit]);
    assertEquals(picker.getPicks().replies(), [first.val, second.val]);
    assertEquals(picker.depth, 2);
    assertEquals(picker.startAt(0), false);
  });
});

describe("rotatePicks", () => {
  it("can wrap a picker that's in the middle of a playout", () => {
    const req = new PickRequest(1, 6);
    const wrapped = onePlayout(alwaysPick(3));
    wrapped.startAt(0);
    wrapped.maybePick(req);
    wrapped.maybePick(req);
    // rotate 1 (min) to 2 - that is, add one
    const rotated = rotatePicks(wrapped, [2]);
    assertEquals(rotated.depth, 2);
    assertEquals(rotated.getPicks().replies(), [3, 3]);
    assertEquals(rotated.maybePick(req), { ok: true, val: 4 });

    assertEquals(rotated.getPicks().replies(), [3, 3, 4]);
    assertEquals(wrapped.getPicks().replies(), [3, 3, 3]);

    assertEquals(rotated.depth, 3);
    assertEquals(wrapped.depth, 3);

    assertEquals(rotated.maybePick(req), { ok: true, val: 3 });
    assertEquals(rotated.depth, 4);
  });

  it("returns the new defaults instead of a minimum value", () => {
    const wrapped = minPlayout();
    wrapped.startAt(0);
    const picker = rotatePicks(wrapped, [1, 2]);

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
    const wrapped = new PlayoutSearch();
    while (wrapped.startAt(0)) {
      const picker = rotatePicks(wrapped, [1, 1]);
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
      assert(picker.startAt(0));
      picker = rotatePicks(picker, [1, 1]);
      assertEquals(picker.depth, 0);
      for (let i = 0; i < 3; i++) {
        assert(picker.maybePick(bit).ok);
      }
      assertEquals(picker.depth, 3);
      const picks = JSON.stringify(picker.getPicks().replies());
      if (picker.finishPlayout()) {
        playouts.push(picks);
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
