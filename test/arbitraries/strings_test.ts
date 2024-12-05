import type { Pickable } from "../../src/entrypoints/core.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertSameExamples,
  assertSometimes,
  assertValues,
} from "../lib/asserts.ts";

import { isWellFormed } from "../../src/workarounds.ts";

import { scriptFrom } from "../../src/scripts/scriptFrom.ts";
import { takeAll } from "../../src/ordered.ts";

function assertCharCodeRange(
  set: Pickable<string>,
  min: number,
  max: number,
) {
  const actual = takeAll(set, { limit: 100000 });
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
    assertValues(arb.asciiChar(/x/), ["x"]);
  });
  it("defaults to 'a'", () => {
    assertFirstGenerated(arb.asciiChar(), [{ val: "a", picks: [0] }]);
  });
  it("has a name", () => {
    assertEquals(arb.asciiChar().name, "asciiChar");
    assertEquals(arb.asciiChar(/[a-z]/).name, "/[a-z]/");
  });
});

describe("asciiLetter", () => {
  it("defaults to 'a'", () => {
    assertFirstGenerated(arb.asciiLetter(), [{ val: "a", picks: [0] }]);
  });
  it("includes lowercase and uppercase letters in order", () => {
    assertValues(
      arb.asciiLetter(),
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split(""),
    );
  });
  it("has a name", () => {
    assertEquals(arb.asciiLetter().name, "/[a-zA-Z]/");
  });
});

describe("asciiDigit", () => {
  it("defaults to '0'", () => {
    assertFirstGenerated(arb.asciiDigit(), [{ val: "0", picks: [0] }]);
  });
  it("includes digits in order", () => {
    assertValues(arb.asciiDigit(), "0123456789".split(""));
  });
});

describe("asciiWhitespace", () => {
  it("defaults to a space", () => {
    assertFirstGenerated(arb.asciiWhitespace(), [{ val: " ", picks: [0] }]);
  });
  it("matches the equivalent regexp", () => {
    assertSameExamples(arb.asciiWhitespace(), arb.asciiChar(/\s/));
  });
  it("has a name", () => {
    assertEquals(arb.asciiWhitespace().name, "whitespace");
  });
});

describe("asciiSymbol", () => {
  it("defaults to '!'", () => {
    assertFirstGenerated(arb.asciiSymbol(), [{ val: "!", picks: [0] }]);
  });
  it("includes symbols in order", () => {
    assertValues(
      arb.asciiSymbol(),
      "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".split(""),
    );
  });
});

describe("char16", () => {
  it("defaults to 'a'", () => {
    assertFirstGenerated(arb.char16(), [{ val: "a", picks: [0] }]);
  });

  it("includes all code points", () => {
    assertCharCodeRange(arb.char16(), 0, 0xFFFF);
  });

  it("is sometimes ASCII", () => {
    const isASCII = (val: string) => {
      const code = val.charCodeAt(0);
      return code >= 0 && code < 128;
    };
    assertSometimes(arb.char16(), isASCII, 20, 50);
  });

  it("is usually well-formed", () => {
    assertSometimes(arb.char16(), isWellFormed, 85, 95);
  });

  it("has a name", () => {
    assertEquals(arb.char16().name, "char16");
  });
});

function codeUnits(str: string): string[] {
  return [...str].map((c) => c.charCodeAt(0).toString(16));
}

describe("unicodeChar", () => {
  it("defaults to 'a'", () => {
    assertFirstGenerated(arb.unicodeChar(), [{ val: "a", picks: [0] }]);
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
  it("chooses length 1 or 2 with equal probability", () => {
    assertSometimes(arb.unicodeChar(), (str) => str.length === 1, 45, 55);
  });
  it("has a name", () => {
    assertEquals(arb.unicodeChar().name, "unicodeChar");
  });
});

describe("string", () => {
  it("defaults to an empty string", () => {
    assertFirstGenerated(arb.string(), [{ val: "", picks: [0] }]);
  });

  it("sometimes generates short and max lengths", () => {
    repeatTest(arb.string(), (str, console) => {
      for (let len = 0; len < 20; len++) {
        console.sometimes(`length is ${len}`, str.length === len);
      }
      console.sometimes(`length is 1000`, str.length === 1000);
    });
  });

  describe("with length 1", () => {
    it("is usually well-formed", () => {
      assertSometimes(arb.string({ length: 1 }), isWellFormed, 85, 95);
    });
  });

  describe("with length 2", () => {
    it("is usually well-formed", () => {
      assertSometimes(arb.string({ length: 2 }), isWellFormed, 85, 95);
    });
  });

  it("has a name", () => {
    assertEquals(arb.string().name, "string");
  });

  it("has the cachable flag set", () => {
    assertEquals(scriptFrom(arb.string()).opts.cachable, true);
  });
});

describe("wellFormedString", () => {
  it("defaults to an empty string", () => {
    assertFirstGenerated(arb.wellFormedString(), [{ val: "", picks: [0] }]);
  });

  it("sometimes generates short and max lengths", () => {
    repeatTest(arb.wellFormedString(), (str, console) => {
      for (let len = 0; len < 20; len++) {
        console.sometimes(`length is ${len}`, str.length === len);
      }
      console.sometimes(`length is 1000`, str.length === 1000);
    });
  });

  it("starts with the empty string, followed by ascii letters", () => {
    assertFirstValues(arb.wellFormedString(), [
      "",
      "a",
      "b",
      "aa",
      "ba",
      "c",
      "ca",
      "ab",
      "bb",
      "cb",
      "d",
      "da",
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

  it("generates strings with a fixed length", () => {
    const example = arb.from((pick) => {
      const length = pick(arb.int(0, 5));
      const s = pick(arb.wellFormedString({ length }));
      return { length, s };
    });
    repeatTest(example, ({ length, s }) => {
      assertEquals(s.length, length);
    });
  });

  it("generates strings with a maximum length", () => {
    const example = arb.from((pick) => {
      const max = pick(arb.int(0, 5));
      const s = pick(arb.wellFormedString({ length: { max } }));
      return { max, s };
    });
    repeatTest(example, ({ max, s }, console) => {
      console.log("code points", [...s].map((c) => c.codePointAt(0)));
      assert(s.length <= max);
    });
  });

  it("has a name", () => {
    assertEquals(arb.wellFormedString().name, "wellFormedString");
  });
});
