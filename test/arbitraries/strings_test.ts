import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertParses } from "../../src/asserts.ts";

import * as arb from "../../src/arbitraries.ts";

describe("char16", () => {
  it("should default to 'x'", () => {
    assertEquals(arb.char16.default, "x");
  });
  it("should parse a code point to its string", () => {
    assertParses(arb.char16, [0x20], " ");
  });
});

describe("anyString", () => {
  it("should default to an empty string", () => {
    assertEquals(arb.anyString().default, "");
  });
  it("should parse a string", () => {
    assertParses(arb.anyString(), [2, 0x20, 0x21], " !");
  });
});
