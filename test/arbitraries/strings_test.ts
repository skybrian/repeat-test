import { describe, it } from "@std/testing/bdd";
import { assertEquals, fail } from "@std/assert";
import { assertParses } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";
import { isWellFormed } from "../../src/workarounds.ts";

import * as arb from "../../src/arbitraries.ts";

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
      assertEquals(parsed.val.length, 1);
      assertEquals(parsed.val, String.fromCodePoint(i));
    }
  });
});

describe("anyString", () => {
  it("should default to an empty string", () => {
    assertEquals(arb.anyString().default, "");
  });
  it("should parse ascii characters", () => {
    assertParses(arb.anyString(), [2, 0x20, 0x21], " !");
  });
  it("should parse an unpaired surrogate", () => {
    assertParses(arb.anyString(), [1, 0xD800], "\uD800");
  });
});

function codeUnits(str: string): string[] {
  return [...str].map((c) => c.charCodeAt(0).toString(16));
}

const surrogateGap = 0xdfff - 0xd800 + 1;

describe("unicodeChar", () => {
  it("should default to 'x'", () => {
    assertEquals(arb.unicodeChar.default, "x");
  });
  it("should always return a well-formed string", () => {
    repeatTest(arb.unicodeChar, (str) => {
      assertEquals(
        isWellFormed(str),
        true,
        `not well-formed: ${codeUnits(str)}`,
      );
    });
  });
});

describe("wellFormedString", () => {
  it("should default to an empty string", () => {
    assertEquals(arb.wellFormedString().default, "");
  });
  it("should parse ascii characters", () => {
    assertParses(arb.wellFormedString(), [2, 0x20, 0x21], " !");
  });
  it("should parse an emoji", () => {
    assertParses(arb.wellFormedString(), [1, 0x1FA97 - surrogateGap], "🪗");
  });
  it("should always return a well-formed string", () => {
    repeatTest(arb.wellFormedString(), (str) => {
      assertEquals(
        isWellFormed(str),
        true,
        `not well-formed: ${codeUnits(str)}`,
      );
    });
  });
});
