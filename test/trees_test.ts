import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, fail } from "@std/assert";

import { alwaysPickDefault, PickRequest } from "../src/picks.ts";

import { SearchTree } from "../src/trees.ts";

describe("SearchTree", () => {
  it("provides one playout for a constant", () => {
    const tree = new SearchTree();
    const picker = tree.startPlayout(alwaysPickDefault, 0);
    assert(picker !== undefined);
    picker.close();
    assertEquals(tree.startPlayout(alwaysPickDefault, 1000), undefined);
  });
  it("provides two playouts for a coin flip", () => {
    const bit = new PickRequest(0, 1);
    const tree = new SearchTree();
    let picker = tree.startPlayout(alwaysPickDefault, 1);
    assert(picker !== undefined);
    assertEquals(picker.pick(bit), 0);
    picker.close();
    picker = tree.startPlayout(alwaysPickDefault, 0);
    assert(picker !== undefined, "expected a second playout");
    assertEquals(picker.pick(bit), 1);
    picker.close();
    assertEquals(tree.startPlayout(alwaysPickDefault, 1000), undefined);
  });
  it("fully explores a combination lock", () => {
    const digit = new PickRequest(0, 9);
    const tree = new SearchTree();
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const picker = tree.startPlayout(alwaysPickDefault, 999 - i);
      assert(picker !== undefined);
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
      picker.close();
    }
    assertEquals(tree.startPlayout(alwaysPickDefault, 0), undefined);
    assertEquals(seen.size, 1000);
  });
});
