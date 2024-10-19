import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { PickRequest } from "../src/picks.ts";
import { onePlayout } from "../src/backtracking.ts";

const bit = new PickRequest(0, 1);

describe("SinglePlayoutPicker", () => {
  it("records one playout", () => {
    const playouts = onePlayout(randomPicker(123));
    assert(playouts.startAt(0));
    const first = playouts.nextPick(bit);
    assert(first !== undefined);
    const second = playouts.nextPick(bit);
    assert(second !== undefined);
    assertEquals(playouts.depth, 2);
    assertEquals(playouts.startAt(0), false);
  });
  describe("nextPick", () => {
    it("throws if called without starting a playout", () => {
      const picker = onePlayout(randomPicker(123));
      assertThrows(() => {
        picker.nextPick(bit);
      }, Error);
    });
  });
  describe("finishPlayout", () => {
    it("throws if called without starting a playout", () => {
      const picker = onePlayout(randomPicker(123));
      assertThrows(() => {
        picker.endPlayout();
      }, Error);
    });
  });
});
