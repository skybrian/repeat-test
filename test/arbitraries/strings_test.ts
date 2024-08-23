import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import { repeatTest } from "@skybrian/repeat-test/runner";
import * as arb from "@skybrian/repeat-test/arbs";

import {
  assertFirstGenerated,
  assertFirstValues,
  assertSameExamples,
  assertValues,
} from "../../src/asserts.ts";

import { isWellFormed } from "../../src/workarounds.ts";

import { takeAll } from "../../src/multipass_search.ts";
import { generate } from "../../src/generated.ts";
import type { PickSet } from "../../src/generated.ts";
import { randomPicker } from "../../src/random.ts";
import { onePlayout } from "../../src/backtracking.ts";

function assertCharCodeRange(
  set: PickSet<string>,
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
  it("has a label", () => {
    assertEquals(arb.asciiChar().label, "asciiChar");
    assertEquals(arb.asciiChar(/[a-z]/).label, "/[a-z]/");
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
  it("has a label", () => {
    assertEquals(arb.asciiLetter().label, "/[a-zA-Z]/");
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
  it("has a label", () => {
    assertEquals(arb.asciiWhitespace().label, "whitespace");
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
  it("picks ascii characters half the time", () => {
    const rand = randomPicker(123);
    let asciiCount = 0;
    for (let i = 0; i < 1000; i++) {
      const gen = generate(arb.char16(), onePlayout(rand));
      assert(gen !== undefined);
      const code = gen.val.charCodeAt(0);
      if (code >= 0 && code < 128) {
        asciiCount++;
      }
    }

    assert(
      Math.abs(asciiCount - 500) < 50,
      `expected about 500 ascii characters, got ${asciiCount}`,
    );
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
  it("has a label", () => {
    assertEquals(arb.unicodeChar().label, "unicodeChar");
  });
});

describe("string", () => {
  it("defaults to an empty string", () => {
    assertFirstGenerated(arb.string(), [{ val: "", picks: [0] }]);
  });
  it("has a label", () => {
    assertEquals(arb.string().label, "anyString");
  });
});

describe("wellFormedString", () => {
  it("defaults to an empty string", () => {
    assertFirstGenerated(arb.wellFormedString(), [{ val: "", picks: [0] }]);
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
