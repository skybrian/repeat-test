import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { assertParses, assertSameExamples } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";
import { isWellFormed } from "../../src/workarounds.ts";

import * as arb from "../../src/arbitraries.ts";
import Arbitrary from "../../src/arbitrary_class.ts";

function assertContainsAscii(arb: Arbitrary<string>) {
  const actual = arb.takeAll();
  assertEquals(actual.length, 128);
  const actualSet = new Set(actual);
  assertEquals(actualSet.size, 128);
  for (let i = 0; i < 128; i++) {
    assert(actualSet.has(String.fromCharCode(i)));
  }
}

describe("asciiChar", () => {
  it("selects all ascii characters by default", () => {
    assertContainsAscii(arb.asciiChar());
  });
  it("selects all ascii characters given a regexp", () => {
    assertContainsAscii(arb.asciiChar(/.*/));
  });
  it("can select a single ascii character", () => {
    assertEquals(arb.asciiChar(/x/).takeAll(), ["x"]);
  });
  it("defaults to 'a'", () => {
    assertEquals(arb.asciiChar().default, "a");
  });
});

describe("asciiLetter", () => {
  it("defaults to 'a'", () => {
    assertEquals(arb.asciiLetter().default, "a");
  });
  it("includes lowercase and uppercase letters in order", () => {
    assertEquals(
      arb.asciiLetter().takeAll(),
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split(""),
    );
  });
});

describe("asciiDigit", () => {
  it("defaults to '0'", () => {
    assertEquals(arb.asciiDigit().default, "0");
  });
  it("includes digits in order", () => {
    assertEquals(arb.asciiDigit().takeAll(), "0123456789".split(""));
  });
});

describe("asciiWhitespace", () => {
  it("defaults to a space", () => {
    assertEquals(arb.asciiWhitespace().default, " ");
  });
  it("matches the equivalent regexp", () => {
    assertSameExamples(arb.asciiWhitespace(), arb.asciiChar(/\s/));
  });
});

describe("asciiSymbol", () => {
  it("defaults to '!'", () => {
    assertEquals(arb.asciiSymbol().default, "!");
  });
  it("includes symbols in order", () => {
    assertEquals(
      arb.asciiSymbol().takeAll(),
      "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""),
    );
  });
});

describe("char16", () => {
  it("defaults to 'x'", () => {
    assertEquals(arb.char16().default, "x");
  });
  it("parses a pick as as a code point", () => {
    for (let i = 0; i < 0xFFFF; i++) {
      assertParses(arb.char16(), [i], String.fromCodePoint(i));
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
