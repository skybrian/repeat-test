import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as codec from "../../src/codecs.ts";

describe("asciiChar", () => {
  it("round-trips ascii characters", () => {
    repeatTest(arb.asciiChar(), (val) => {
      assertRoundTrip(codec.asciiChar(), val);
    });
  });
});

describe("char16", () => {
  it("round-trips single-character strings", () => {
    repeatTest(arb.char16(), (val) => {
      assertRoundTrip(codec.char16(), val);
    });
  });
});

describe("anyString", () => {
  it("round-trips any generated string", () => {
    repeatTest(arb.anyString(), (val) => {
      assertRoundTrip(codec.anyString(), val);
    });
  });
  it("encodes characters as an array of ints, using our modified ascii table", () => {
    assertEncoding(codec.anyString(), [1, 0, 1, 1, 0], "ab");
  });
  it("encodes an unpaired surrogate", () => {
    assertEncoding(codec.anyString(), [1, 0xD800, 0], "\uD800");
  });
});

const surrogateGap = 0xdfff - 0xd800 + 1;

describe("wellFormedString", () => {
  it("round-trips any generated string", () => {
    repeatTest(arb.wellFormedString(), (val) => {
      assertRoundTrip(codec.wellFormedString(), val);
    });
  });
  it("rejects unpaired surrogates", () => {
    assertEquals(
      codec.wellFormedString().maybeEncode("\uD800"),
      undefined,
    );
  });
  it("parses an array of ints using our modified ascii table", () => {
    assertEncoding(codec.wellFormedString(), [1, 0, 1, 1, 0], "ab");
  });
  it("parses other Unicode characters represented as code points", () => {
    assertEncoding(
      codec.wellFormedString(),
      [1, 0x1FA97 - surrogateGap, 0],
      "🪗",
    );
  });
});