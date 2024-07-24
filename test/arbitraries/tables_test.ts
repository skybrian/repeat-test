import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import * as arb from "../../src/arbitraries.ts";

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
