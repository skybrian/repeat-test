import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { PickRequest } from "../src/picks.ts";
import { onePlayout } from "../src/backtracking.ts";

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
  describe("maybePick", () => {
    it("throws if called without starting a playout", () => {
      const picker = onePlayout(randomPicker(123));
      assertThrows(() => {
        picker.maybePick(bit);
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
  describe("getPicks", () => {
    it("throws if called without starting a playout", () => {
      const picker = onePlayout(randomPicker(123));
      assertThrows(() => {
        picker.getPicks();
      }, Error);
    });
  });
});
