import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import * as arb from "@skybrian/repeat-test/arbs";
import * as dom from "@skybrian/repeat-test/doms";
import { repeatTest } from "@skybrian/repeat-test/runner";

import { assertRoundTrip, assertThrows } from "../support/asserts.ts";

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
  it("round-trips any string", () => {
    repeatTest(arb.string(), (val) => {
      assertRoundTrip(dom.string(), val);
    });
  });

  it("round-trips strings with a given length", () => {
    const example = arb.from((pick) => {
      const length = pick(arb.int(0, 5));
      const s = pick(arb.string({ length }));
      return { length, s };
    });
    repeatTest(example, ({ length, s }) => {
      assertRoundTrip(dom.string({ length }), s);
    });
  });

  it("rejects non-strings", () => {
    const str = dom.string();
    assertThrows(() => str.parse(null), Error, "not a string");
  });

  it("rejects strings that are too short", () => {
    const str = dom.string({ length: { min: 1 } });
    assertThrows(
      () => str.parse(""),
      Error,
      "string too short; want length >= 1, got: 0",
    );
  });

  it("rejects strings that are too long", () => {
    const str = dom.string({ length: { max: 1 } });
    assertThrows(
      () => str.parse("ab"),
      Error,
      "string too long; want length <= 1, got: 2",
    );
  });
});

describe("wellFormedString", () => {
  const str = dom.wellFormedString();

  it("round-trips well-formed strings", () => {
    repeatTest(str, (val) => {
      assertRoundTrip(str, val);
    });
  });

  it("round-trips well-formed strings with a length constraint", () => {
    const example = arb.from((pick) => {
      const length = pick(arb.int(0, 5));
      const s = pick(arb.wellFormedString({ length }));
      return { length, s };
    });
    repeatTest(example, ({ length, s }) => {
      assertRoundTrip(dom.wellFormedString({ length }), s);
    });
  });

  it("rejects a non-string", () => {
    assertThrows(() => str.parse(null), Error, "not a string");
  });

  it("rejects an unpaired surrogates", () => {
    assertThrows(() => str.parse("\uD800"), Error, "0: unpaired surrogate");
  });

  it("rejects strings that are too short", () => {
    const example = arb.from((pick) => {
      const length = pick(arb.int(1, 5));
      const shorter = pick(arb.int(0, length - 1));
      const s = pick(arb.wellFormedString({ length: shorter }));
      return { length, s };
    });
    repeatTest(example, ({ length, s }) => {
      strictEqual(s.length < length, true);
      const d = dom.wellFormedString({ length });
      assertThrows(() => d.parse(s), Error, "string too short");
    });
  });

  it("rejects strings that are too long", () => {
    const example = arb.from((pick) => {
      const length = pick(arb.int(1, 5));
      const longer = pick(arb.int(length + 1, length + 3));
      const s = pick(arb.wellFormedString({ length: longer }));
      return { length, s };
    });
    repeatTest(example, ({ length, s }) => {
      strictEqual(s.length > length, true);
      const d = dom.wellFormedString({ length });
      assertThrows(() => d.parse(s), Error, "string too long");
    });
  });
});
