import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";

import { IntRequest } from "../src/picks.ts";
import {
  Domain,
  ParseError,
  type PickifyFunction,
} from "../src/domain_class.ts";

describe("ParseError", () => {
  const err = new ParseError("oops", 123);

  it("has the expected properties", () => {
    const err = new ParseError("oops", 123);
    assertEquals(Object.keys(err), ["actual", "name"]);
    assertEquals(err.name, "ParseError");
    assertEquals(err.message, "oops");
    assertEquals(err.actual, 123);
  });

  it("works with instanceof", () => {
    assert(err instanceof ParseError);
  });

  it("pretty-prints the actual value", () => {
    const err = new ParseError("oops", { a: 123 });
    assertStringIncludes(Deno.inspect(err), `{ a: 123 }`);
  });
});

const sixSided = new IntRequest(1, 6);

describe("Domain", () => {
  describe("make", () => {
    it("sets maxSize when based on an IntRequest", () => {
      const dom = Domain.make(sixSided, (val) => {
        if (typeof val !== "number") return undefined;
        if (val < 1 || val > 6) return undefined;
        return [val];
      });

      assertEquals(dom.buildScript.opts.maxSize, 6);
    });

    it("throws an Error if the callback returns undefined with no error", () => {
      assertThrows(
        () => Domain.make(sixSided, () => undefined),
        Error,
        "can't pickify default of 1..6: callback returned undefined",
      );
    });

    it("throws an Error if the callback returns undefined with an error", () => {
      const callback: PickifyFunction = (val, sendErr) => {
        sendErr("oops!", val);
        return undefined;
      };
      assertThrows(
        () => Domain.make(sixSided, callback),
        Error,
        "can't pickify default of 1..6: oops",
      );
    });

    it("throws an Error if the callback returns picks that don't match the generated default", () => {
      const callback: PickifyFunction = (v) => {
        if (v === 1) {
          return [123];
        }
        return undefined;
      };
      assertThrows(
        () => Domain.make(sixSided, callback),
        Error,
        "callback's picks don't match for the default value of 1..6",
      );
    });
  });

  const bit = Domain.make(
    new IntRequest(0, 1),
    (v) => {
      return (v === 0 || v === 1) ? [v] : undefined;
    },
  );

  const roll = Domain.make(
    sixSided,
    (v, sendErr) => {
      if (typeof v !== "number") {
        sendErr("not a number", v);
        return undefined;
      } else if (v < 1 || v > 6) {
        sendErr("not in range", v);
        return undefined;
      }
      return [v];
    },
  );

  describe("parse", () => {
    it("throws a default error if the callback didn't supply a message", () => {
      assertThrows(
        () => bit.parse("hello"),
        ParseError,
        `not in domain\n\n"hello"\n`,
      );
    });
    it("throws a custom error if the callback called sendErr", () => {
      assertThrows(
        () => roll.parse("hello"),
        ParseError,
        `not a number\n\n"hello"\n`,
      );
    });
  });

  describe("filter", () => {
    it("rejects values outside the domain with a default error", () => {
      assertThrows(() => bit.parse("hello"), ParseError, "not in domain");
    });
    it("rejects values outside the domain with a custom error", () => {
      assertThrows(
        () => roll.filter((v) => v === 1).parse(7),
        ParseError,
        "not in range",
      );
    });
    it("rejects values that have been filtered out", () => {
      assertThrows(
        () => roll.filter((v) => v === 1).parse(2),
        ParseError,
        "filter rejected value",
      );
    });
  });

  describe("regenerate", () => {
    it("returns a default error if the callback didn't supply one", () => {
      assertEquals(bit.regenerate(2), {
        ok: false,
        message: "not in domain",
        actual: 2,
      });
    });
  });

  describe("pickify", () => {
    it("returns a default error if the callback didn't supply one", () => {
      assertEquals(bit.pickify(2), {
        ok: false,
        message: "not in domain",
        actual: 2,
      });
    });
  });

  describe("innerPickify", () => {
    const errs: string[] = [];

    const sendErr = (
      err: string,
      val: unknown,
      opts?: { at: string | number },
    ) => {
      if (opts?.at) {
        errs.push(`${opts.at}: ${err} (${val})`);
      } else {
        errs.push(`${err} (${val})`);
      }
    };

    beforeEach(() => {
      errs.length = 0;
    });

    it("returns undefined if the callback returns undefined", () => {
      assertEquals(bit.innerPickify(2, sendErr), undefined);
      assertEquals(errs, []);
    });

    it("prepends a location to an inner error", () => {
      const dom = Domain.make(sixSided, (v, sendErr) => {
        if (v !== 1) {
          sendErr("oops!", v, { at: "inner" });
          return undefined;
        }
        return [v];
      });
      assertEquals(dom.innerPickify(2, sendErr, "outer"), undefined);
      assertEquals(errs, ["outer.inner: oops! (2)"]);
    });
  });

  describe("with", () => {
    it("returns a copy with a new name", () => {
      const newDom = roll.with({ name: "new name" });
      assertEquals(newDom.name, "new name");
    });
  });

  describe("toString", () => {
    it("returns a string with the name", () => {
      const original = Domain.of(1, 2, 3);
      assertEquals(original.toString(), "Domain('3 examples')");
    });
  });
});
