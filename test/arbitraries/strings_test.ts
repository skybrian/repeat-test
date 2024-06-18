import { describe, it } from "@std/testing/bdd";
import { assertEquals, fail } from "@std/assert";
import { assertParseFails, assertParses } from "../../src/asserts.ts";
import TestRunner from "../../src/simple_runner.ts";

import * as arb from "../../src/arbitraries.ts";

const runner = new TestRunner();

describe("char16", () => {
  it("should default to 'x'", () => {
    assertEquals(arb.char16.default, "x");
  });
  it("should return a string of length 1 with the appropriate code point", () => {
    for (let i = 0; i < 0xFFFF; i++) {
      const parsed = arb.char16.parse([i]);
      if (!parsed.ok) {
        fail(`Failed to parse ${i}`);
      }
      assertEquals(parsed.value.length, 1);
      assertEquals(parsed.value, String.fromCodePoint(i));
    }
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

// Workaround for https://github.com/denoland/deno/issues/24238
interface ExtraStringMethods {
  isWellFormed(): boolean;
}

function isWellFormed(str: string): boolean {
  return (str as unknown as ExtraStringMethods).isWellFormed();
}

describe("wellFormedString", () => {
  it("should default to an empty string", () => {
    assertEquals(arb.wellFormedString().default, "");
  });
  it("should parse a string", () => {
    assertParses(arb.wellFormedString(), [2, 0x20, 0x21], " !");
  });
  it("should not parse an unpaired surrogate", () => {
    assertParseFails(arb.wellFormedString(), [0xD800], "", 0);
  });
  it("should always return a well-formed string", () => {
    runner.repeat(arb.wellFormedString(), (str) => {
      assertEquals(isWellFormed(str), true);
    });
  });
});
