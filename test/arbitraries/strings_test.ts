import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import { assertFirstValues, assertSameExamples } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";
import { isWellFormed } from "../../src/workarounds.ts";

import * as arb from "../../src/arbitraries.ts";
import Arbitrary from "../../src/arbitrary_class.ts";

function assertCharCodeRange(
  arb: Arbitrary<string>,
  min: number,
  max: number,
) {
  const actual = arb.takeAll({ limit: 100000 });
  assertEquals(actual.length, max - min + 1);
  const actualSet = new Set(actual);
  assertEquals(actualSet.size, max - min + 1);
  for (let i = min; i <= max; i++) {
    assert(actualSet.has(String.fromCharCode(i)));
  }
}

describe("asciiChar", () => {
  it("selects all ascii characters, by default", () => {
    assertCharCodeRange(arb.asciiChar(), 0, 127);
  });
  it("selects all ascii characters, given a regexp that selects everything", () => {
    assertCharCodeRange(arb.asciiChar(), 0, 127);
  });
  it("can select a single ascii character", () => {
    assertEquals(arb.asciiChar(/x/).takeAll(), ["x"]);
  });
  it("defaults to 'a'", () => {
    assertEquals(arb.asciiChar().default(), "a");
  });
  it("has a label", () => {
    assertEquals(arb.asciiChar().label, "asciiChar");
    assertEquals(arb.asciiChar(/[a-z]/).label, "/[a-z]/");
  });
});

describe("asciiLetter", () => {
  it("defaults to 'a'", () => {
    assertEquals(arb.asciiLetter().default(), "a");
  });
  it("includes lowercase and uppercase letters in order", () => {
    assertEquals(
      arb.asciiLetter().takeAll(),
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split(""),
    );
  });
  it("has a label", () => {
    assertEquals(arb.asciiLetter().label, "/[a-zA-Z]/");
  });
});

describe("asciiDigit", () => {
  it("defaults to '0'", () => {
    assertEquals(arb.asciiDigit().default(), "0");
  });
  it("includes digits in order", () => {
    assertEquals(arb.asciiDigit().takeAll(), "0123456789".split(""));
  });
});

describe("asciiWhitespace", () => {
  it("defaults to a space", () => {
    assertEquals(arb.asciiWhitespace().default(), " ");
  });
  it("matches the equivalent regexp", () => {
    assertSameExamples(arb.asciiWhitespace(), arb.asciiChar(/\s/));
  });
  it("has a label", () => {
    assertEquals(arb.asciiWhitespace().label, "whitespace");
  });
});

describe("asciiSymbol", () => {
  it("defaults to '!'", () => {
    assertEquals(arb.asciiSymbol().default(), "!");
  });
  it("includes symbols in order", () => {
    assertEquals(
      arb.asciiSymbol().takeAll(),
      "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""),
    );
  });
});

describe("char16", () => {
  it("defaults to 'a'", () => {
    assertEquals(arb.char16().default(), "a");
  });
  it("includes all code points", () => {
    assertCharCodeRange(arb.char16(), 0, 0xFFFF);
  });
  it("has a label", () => {
    assertEquals(arb.char16().label, "char16");
  });
});

function codeUnits(str: string): string[] {
  return [...str].map((c) => c.charCodeAt(0).toString(16));
}

describe("unicodeChar", () => {
  it("defaults to 'a'", () => {
    assertEquals(arb.unicodeChar().default(), "a");
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
  it("has a label", () => {
    assertEquals(arb.unicodeChar().label, "unicodeChar");
  });
});

describe("anyString", () => {
  it("defaults to an empty string", () => {
    assertEquals(arb.anyString().default(), "");
  });
  it("has a label", () => {
    assertEquals(arb.anyString().label, "anyString");
  });
});

describe("wellFormedString", () => {
  it("defaults to an empty string", () => {
    assertEquals(arb.wellFormedString().default(), "");
  });
  it("starts with the empty string, followed by single ascii characters", () => {
    assertFirstValues(arb.wellFormedString(), [
      "",
      ...("abcdefghijklmnopqrstuvwxyz".split("")),
    ]);
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
  it("has a label", () => {
    assertEquals(arb.wellFormedString().label, "wellFormedString");
  });
});
