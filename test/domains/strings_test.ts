import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as dom from "../../src/domains.ts";

describe("asciiChar", () => {
  it("round-trips ascii characters", () => {
    repeatTest(arb.asciiChar(), (val) => {
      assertRoundTrip(dom.asciiChar(), val);
    });
  });
});

describe("char16", () => {
  it("round-trips single-character strings", () => {
    repeatTest(arb.char16(), (val) => {
      assertRoundTrip(dom.char16(), val);
    });
  });
});

describe("anyString", () => {
  it("round-trips any generated string", () => {
    repeatTest(arb.anyString(), (val) => {
      assertRoundTrip(dom.anyString(), val);
    });
  });
  it("encodes characters as an array of ints, using our modified ascii table", () => {
    assertEncoding(dom.anyString(), [1, 0, 1, 1, 0], "ab");
  });
  it("encodes an unpaired surrogate", () => {
    assertEncoding(dom.anyString(), [1, 0xD800, 0], "\uD800");
  });
  it("rejects non-strings", () => {
    const str = dom.anyString();
    assertThrows(() => str.parse(null), Error, "not a string");
  });
});

const surrogateGap = 0xdfff - 0xd800 + 1;

describe("wellFormedString", () => {
  it("round-trips any generated string", () => {
    repeatTest(arb.wellFormedString(), (val) => {
      assertRoundTrip(dom.wellFormedString(), val);
    });
  });
  it("rejects non-strings", () => {
    const str = dom.wellFormedString();
    assertThrows(() => str.parse(null), Error, "not a string");
  });
  it("rejects unpaired surrogates", () => {
    const str = dom.wellFormedString();
    assertThrows(() => str.parse("\uD800"), Error, "not a well-formed string");
  });
  it("parses an array of ints using our modified ascii table", () => {
    assertEncoding(dom.wellFormedString(), [1, 0, 1, 1, 0], "ab");
  });
  it("parses other Unicode characters represented as code points", () => {
    assertEncoding(
      dom.wellFormedString(),
      [1, 0x1FA97 - surrogateGap, 0],
      "🪗",
    );
  });
});
