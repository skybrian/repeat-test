import type { GroupEdit } from "../src/edits.ts";

import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { PickRequest } from "../src/picks.ts";
import { EditResponder, keep, replace, snip } from "../src/edits.ts";

const setMin: GroupEdit = (_) => replace(0);
const setBad: GroupEdit = (_) => replace(-1);

describe("PickEditor", () => {
  it("throws if a previous pick isn't an integer", () => {
    assertThrows(
      () => new EditResponder([0, 0.1], keep),
      Error,
      "1: expected a safe integer, got: 0.1",
    );
  });
  it("throws if a previous pick is negative", () => {
    assertThrows(
      () => new EditResponder([0, 2, -3], keep),
      Error,
      "2: expected a non-negative integer, got: -3",
    );
  });
  it("returns the same picks if the editor doesn't change them", () => {
    const picker = new EditResponder([0, 1], keep);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 1);
    assertEquals(picker.edits, 0);
  });
  it("returns minimum picks if there are no previous picks", () => {
    const picker = new EditResponder([], keep);
    assertEquals(picker.nextPick(new PickRequest(1, 3)), 1);
    assertEquals(picker.nextPick(new PickRequest(2, 4)), 2);
    assertEquals(picker.edits, 0);
  });
  it("returns the minimum pick if the editor sets it to min", () => {
    const picker = new EditResponder([0, 2], setMin);
    assertEquals(picker.nextPick(new PickRequest(0, 0)), 0);
    assertEquals(picker.nextPick(new PickRequest(1, 3)), 1);
    assertEquals(picker.nextPick(new PickRequest(2, 5)), 2);
    assertEquals(picker.edits, 1);
  });
  it("returns the minumum pick if the editor changes it to be out of range", () => {
    const picker = new EditResponder([0, 1, 2], setBad);
    assertEquals(picker.nextPick(new PickRequest(0, 0)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 1)), 0);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 0);
    assertEquals(picker.edits, 2);
    assertEquals(picker.deletes, 0);
  });
  it("returns minimum picks if the editor deletes everything", () => {
    const picker = new EditResponder([0, 1, 2], snip);
    assertEquals(picker.nextPick(new PickRequest(0, 3)), 0);
    assertEquals(picker.edits, 0);
    assertEquals(picker.deletes, 3);
  });
});
