import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";
import { assertValues } from "../../src/asserts.ts";

describe("uniqueArray", () => {
  const bools = arb.uniqueArray(arb.boolean());
  it("defaults to an empty array", () => {
    assertEquals(bools.default(), []);
  });
  it("generates all combinations of a boolean", () => {
    assertValues(bools, [
      [],
      [false],
      [true],
      [true, false],
      [false, true],
    ]);
  });
  it("has a label", () => {
    assertEquals(bools.label, "uniqueArray");
  });
  it("can be configured with a label", () => {
    const array = arb.uniqueArray(arb.int(1, 3), { label: "my array" });
    assertEquals(array.label, "my array");
  });
});

describe("table", () => {
  const table = arb.table({
    k: arb.int32(),
    v: arb.anyString(),
  });
  it("defaults to zero rows", () => {
    assertEquals(table.default(), []);
  });
  it("has a label", () => {
    assertEquals(table.label, "table");
  });
  it("can be configured with a label", () => {
    const table = arb.table({ k: arb.int32() }, { label: "my table" });
    assertEquals(table.label, "my table");
  });
});
