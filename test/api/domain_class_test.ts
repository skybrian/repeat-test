import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { assertRoundTrip, assertThrows } from "./support/asserts.ts";
import { Domain, IntRequest, ParseError } from "@skybrian/repeat-test/core";

const sixSided = new IntRequest(1, 6);

describe("ParseError", () => {
  it("has the expected properties", () => {
    const err = new ParseError("oops", 123);
    deepStrictEqual(Object.keys(err), ["actual", "name"]);
    strictEqual(err.name, "ParseError");
    strictEqual(err.message, "oops");
    strictEqual(err.actual, 123);
  });

  it("works with instanceof", () => {
    strictEqual(new ParseError("oops", 123) instanceof ParseError, true);
  });
});

describe("Domain", () => {
  describe("make", () => {
    it("sets maxSize when based on an IntRequest", () => {
      const dom = Domain.make(sixSided, (val) => {
        if (typeof val !== "number" || val < 1 || val > 6) return undefined;
        return [val];
      });
      strictEqual(dom.buildScript.opts.maxSize, 6);
    });

    it("creates a round-trippable domain from an IntRequest", () => {
      const dom = Domain.make(sixSided, (val) => {
        if (typeof val !== "number" || val < 1 || val > 6) return undefined;
        return [val];
      });
      assertRoundTrip(dom, 4);
    });

    it("throws an Error if the callback returns undefined with no error", () => {
      assertThrows(
        () => Domain.make(sixSided, () => undefined),
        Error,
        "can't pickify default of 1..6: callback returned undefined",
      );
    });

    it("throws an Error if the callback returns undefined with an error", () => {
      assertThrows(
        () =>
          Domain.make(sixSided, (val, sendErr) => {
            sendErr("oops!", val);
            return undefined;
          }),
        Error,
        "can't pickify default of 1..6: oops",
      );
    });

    it("throws an Error if callback picks do not match the generated default", () => {
      assertThrows(
        () => Domain.make(sixSided, (val) => val === 1 ? [123] : undefined),
        Error,
        "callback's picks don't match for the default value of 1..6",
      );
    });
  });

  const bit = Domain.make(
    new IntRequest(0, 1),
    (val) => val === 0 || val === 1 ? [val] : undefined,
  );
  const roll = Domain.make(sixSided, (val, sendErr) => {
    if (typeof val !== "number") {
      sendErr("not a number", val);
      return undefined;
    }
    if (val < 1 || val > 6) {
      sendErr("not in range", val);
      return undefined;
    }
    return [val];
  });

  describe("parse", () => {
    it("throws a default error if the callback didn't supply a message", () => {
      assertThrows(
        () => bit.parse("hello"),
        ParseError,
        `not in domain\n\n'hello'\n`,
      );
    });

    it("throws a custom error if the callback called sendErr", () => {
      assertThrows(
        () => roll.parse("hello"),
        ParseError,
        `not a number\n\n'hello'\n`,
      );
    });
  });

  describe("filter", () => {
    it("rejects values outside the domain with a default error", () => {
      assertThrows(() => bit.parse("hello"), ParseError, "not in domain");
    });

    it("rejects values outside the domain with a custom error", () => {
      assertThrows(
        () => roll.filter((val) => val === 1).parse(7),
        ParseError,
        "not in range",
      );
    });

    it("rejects values that have been filtered out", () => {
      assertThrows(
        () => roll.filter((val) => val === 1).parse(2),
        ParseError,
        "filter rejected value",
      );
    });
  });

  describe("regenerate", () => {
    it("returns a default error if the callback didn't supply one", () => {
      deepStrictEqual(bit.regenerate(2), {
        ok: false,
        message: "not in domain",
        actual: 2,
      });
    });
  });

  describe("pickify", () => {
    it("returns a default error if the callback didn't supply one", () => {
      deepStrictEqual(bit.pickify(2), {
        ok: false,
        message: "not in domain",
        actual: 2,
      });
    });
  });

  describe("with", () => {
    it("returns a copy with a new name", () => {
      strictEqual(roll.with({ name: "new name" }).name, "new name");
    });
  });

  describe("toString", () => {
    it("returns a string with the name", () => {
      strictEqual(Domain.of(1, 2, 3).toString(), "Domain('3 examples')");
    });
  });
});
