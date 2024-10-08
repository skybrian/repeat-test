import type { StreamEditor } from "../src/edits.ts";

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { PickRequest } from "../src/picks.ts";
import { EditedPickSource, keep, replace, snip } from "../src/edits.ts";

const addOne: StreamEditor = (_, before) => replace(before + 1);

describe("EditPicker", () => {
  it("throws if a previous pick isn't an integer", () => {
    assertThrows(
      () => new EditedPickSource([0, 0.1], keep),
      Error,
      "1: expected a safe integer, got: 0.1",
    );
  });
  it("throws if a previous pick is negative", () => {
    assertThrows(
      () => new EditedPickSource([0, 2, -3], keep),
      Error,
      "2: expected a non-negative integer, got: -3",
    );
  });
  it("returns the same picks if the editor doesn't change them", () => {
    const picker = new EditedPickSource([0, 1], keep);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 1);
    assertEquals(picker.edits, 0);
  });
  it("returns minimum picks if there are no previous picks", () => {
    const picker = new EditedPickSource([], keep);
    assertEquals(picker.nextPick(new PickRequest(1, 3)), 1);
    assertEquals(picker.nextPick(new PickRequest(2, 4)), 2);
    assertEquals(picker.edits, 0);
  });
  it("returns the new pick if the editor changes it", () => {
    const picker = new EditedPickSource([0, 1], addOne);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 1);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 2);
    assertEquals(picker.edits, 2);
  });
  it("returns the minumum pick if the editor changes it to be out of range", () => {
    const picker = new EditedPickSource([0, 1, 2], addOne);
    assertEquals(picker.nextPick(new PickRequest(0, 0)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 1)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 3);
    assertEquals(picker.edits, 2);
    assertEquals(picker.deletes, 0);
  });
  it("returns minimum picks if the editor deletes everything", () => {
    const picker = new EditedPickSource([0, 1, 2], snip);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 0);
    assertEquals(picker.edits, 0);
    assertEquals(picker.deletes, 3);
  });
});
