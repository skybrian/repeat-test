import { describe, it } from "@std/testing/bdd";
import { assert, assertThrows } from "@std/assert";

import { repeatTest } from "@skybrian/repeat-test/runner";
import * as arb from "@skybrian/repeat-test/arbs";
import * as dom from "@skybrian/repeat-test/doms";

import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { isWellFormed } from "../../src/workarounds.ts";

describe("asciiChar", () => {
  const char = dom.asciiChar();
  it("round-trips ascii characters", () => {
    repeatTest(char, (val) => {
      assertRoundTrip(char, val);
    });
  });
  it("rejects non-strings", () => {
    assertThrows(() => char.parse(123), Error, "not a string");
  });
  it("rejects non-ascii characters", () => {
    assertThrows(() => char.parse("😀"), Error, "not an ascii character");
  });
});

describe("char16", () => {
  it("round-trips single-character strings", () => {
    repeatTest(arb.char16(), (val) => {
      assertRoundTrip(dom.char16(), val);
    });
  });
  it("rejects non-strings", () => {
    assertThrows(() => dom.char16().parse(123), Error, "not a string");
  });
  it("rejects non-single-character strings", () => {
    repeatTest(["", "ab"], (val) => {
      assertThrows(
        () => dom.char16().parse(val),
        Error,
        "not a single character",
      );
    });
  });
});

describe("string", () => {
  it("round-trips any generated string", () => {
    repeatTest(arb.string(), (val) => {
      assertRoundTrip(dom.string(), val);
    });
  });
  it("encodes characters as an array of ints, using our modified ascii table", () => {
    assertEncoding(dom.string(), [1, 0, 1, 1, 0], "ab");
  });
  it("encodes an unpaired surrogate", () => {
    assertEncoding(dom.string(), [1, 0xD800, 0], "\uD800");
  });
  it("rejects non-strings", () => {
    const str = dom.string();
    assertThrows(() => str.parse(null), Error, "not a string");
  });
});

const surrogateGap = 0xdfff - 0xd800 + 1;

describe("wellFormedString", () => {
  const str = dom.wellFormedString();
  it("accepts the same strings as isWellFormed", () => {
    repeatTest(arb.string(), (val) => {
      if (isWellFormed(val)) {
        str.parse(val);
      } else {
        assertThrows(() => str.parse(val), Error);
      }
    });
  });
  it("round-trips all string it generates", () => {
    repeatTest(str, (val) => {
      assert(isWellFormed(val));
      assertRoundTrip(str, val);
    });
  });
  it("rejects a non-string", () => {
    assertThrows(() => str.parse(null), Error, "not a string");
  });
  it("rejects an unpaired surrogates", () => {
    assertThrows(() => str.parse("\uD800"), Error, "0: unpaired surrogate");
  });
  it("parses an array of ints using a modified ascii table", () => {
    assertEncoding(str, [1, 0, 1, 1, 0], "ab");
  });
  it("parses other Unicode characters represented as code points", () => {
    assertEncoding(str, [1, 0x1FA97 - surrogateGap, 0], "🪗");
  });
});
