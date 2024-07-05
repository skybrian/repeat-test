import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, fail } from "@std/assert";

import { alwaysPickDefault, PickRequest } from "../src/picks.ts";

import { TreeSearchPicker } from "../src/trees.ts";

describe("TreeSearchPicker", () => {
  it("ends the search after one playout for a constant", () => {
    const picker = new TreeSearchPicker(alwaysPickDefault, 1);
    assertEquals(picker.depth, 0);
    assertEquals(picker.getPicks(), []);
    assertFalse(picker.backTo(0), "Shouldn't be more playouts");
  });

  it("ends the search after two playouts for a coin flip", () => {
    const bit = new PickRequest(0, 1);
    const picker = new TreeSearchPicker(alwaysPickDefault, 1);

    assertEquals(picker.pick(bit), 0);
    assertEquals(picker.depth, 1);
    assertEquals(picker.getPicks(), [0]);

    assert(picker.backTo(0));
    assertEquals(picker.depth, 0);
    assertEquals(picker.getPicks(), []);

    assertEquals(picker.pick(bit), 1);
    assertEquals(picker.getPicks(), [1]);
    assertFalse(picker.backTo(0));
  });

  it("fully explores a combination lock", () => {
    const digit = new PickRequest(0, 9);
    const picker = new TreeSearchPicker(alwaysPickDefault, 1000);

    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const picks: number[] = [];
      for (let j = 0; j < 3; j++) {
        const pick = picker.pick(digit);
        picks.push(pick);
      }
      const key = JSON.stringify(picks);
      if (seen.has(key)) {
        fail(`duplicate picks: ${key}`);
      }
      seen.add(key);
      assertEquals(picker.backTo(0), i < 999);
    }

    const playouts = Array.from(seen.values());
    assertEquals(playouts.length, 1000);
    assertEquals(playouts[0], "[0,0,0]");
    assertEquals(playouts[999], "[9,9,9]");
  });
});
