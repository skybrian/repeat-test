import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { randomPicker } from "../src/random.ts";

import { PickRequest } from "../src/picks.ts";
import { onePlayoutPicker } from "../src/backtracking.ts";

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
