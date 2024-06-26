import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertParses } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";
import { isWellFormed } from "../../src/workarounds.ts";

import * as arb from "../../src/arbitraries.ts";

describe("char16", () => {
  it("defaults to 'x'", () => {
    assertEquals(arb.char16().default, "x");
  });
  it("parses a pick as as a code point", () => {
    for (let i = 0; i < 0xFFFF; i++) {
      const val = arb.char16().parse([i]);
      assertEquals(val.length, 1);
      assertEquals(val, String.fromCodePoint(i));
    }
  });
});

describe("anyString", () => {
  it("defaults to an empty string", () => {
    assertEquals(arb.anyString().default, "");
  });
  it("parses an array of code points", () => {
    assertParses(arb.anyString(), [1, 0x20, 1, 0x21, 0], " !");
  });
  it("parses an unpaired surrogate", () => {
    assertParses(arb.anyString(), [1, 0xD800, 0], "\uD800");
  });
});

function codeUnits(str: string): string[] {
  return [...str].map((c) => c.charCodeAt(0).toString(16));
}

const surrogateGap = 0xdfff - 0xd800 + 1;

describe("unicodeChar", () => {
  it("defaults to 'x'", () => {
    assertEquals(arb.unicodeChar().default, "x");
  });
  it("always returns a well-formed string", () => {
    repeatTest(arb.unicodeChar(), (str) => {
      assertEquals(
        isWellFormed(str),
        true,
        `not well-formed: ${codeUnits(str)}`,
      );
    });
  });
});

describe("wellFormedString", () => {
  it("defaults to an empty string", () => {
    assertEquals(arb.wellFormedString().default, "");
  });
  it("parses ascii characters", () => {
    assertParses(arb.wellFormedString(), [1, 0x20, 1, 0x21, 0], " !");
  });
  it("parses an emoji", () => {
    assertParses(arb.wellFormedString(), [1, 0x1FA97 - surrogateGap, 0], "🪗");
  });
  it("always returns a well-formed string", () => {
    repeatTest(arb.wellFormedString(), (str) => {
      assertEquals(
        isWellFormed(str),
        true,
        `not well-formed: ${codeUnits(str)}`,
      );
    });
  });
});
