import { describe, it } from "@std/testing/bdd";
import { assert, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";

import { assertEncoding } from "../lib/asserts.ts";
import { isWellFormed } from "../../src/workarounds.ts";

describe("string", () => {
  it("encodes characters as an array of ints, using our modified ascii table", () => {
    assertEncoding(dom.string(), [1, 0, 1, 1, 0], "ab");
  });
  it("encodes an unpaired surrogate", () => {
    assertEncoding(dom.string(), [1, 0xD800, 0], "\uD800");
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

  it("generated strings pass the isWellFormed oracle", () => {
    repeatTest(str, (val) => {
      assert(isWellFormed(val));
    });
  });

  it("parses an array of ints using a modified ascii table", () => {
    assertEncoding(str, [1, 0, 1, 1, 0], "ab");
  });
  it("parses other Unicode characters represented as code points", () => {
    assertEncoding(str, [1, 0x1FA97 - surrogateGap, 0], "🪗");
  });
});
