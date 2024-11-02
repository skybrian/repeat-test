import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
  fail,
} from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import { Arbitrary } from "../src/arbitrary_class.ts";
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

describe("Domain", () => {
  describe("make", () => {
    it("preserves maxSize from a copied Arbitrary", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));

      const dom = Domain.make(arb, (val) => {
        if (typeof val !== "number") return undefined;
        if (val < 1 || val > 6) return undefined;
        return [val];
      });

      assertEquals(dom.maxSize, arb.maxSize);
    });

    it("creates a Domain from a non-Arbitrary", () => {
      const dom = Domain.make(new PickRequest(1, 6), (val) => {
        if (typeof val !== "number") return undefined;
        if (val < 1 || val > 6) return undefined;
        return [val];
      });
      assertEquals(dom.innerPickify(2, fail), [2]);
    });

    it("throws an Error if the callback returns undefined with no error", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      assertThrows(
        () => Domain.make(arb, () => undefined),
        Error,
        "can't pickify default of 1..6: callback returned undefined",
      );
    });

    it("throws an Error if the callback returns undefined with an error", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const callback: PickifyFunction = (val, sendErr) => {
        sendErr("oops!", val);
        return undefined;
      };
      assertThrows(
        () => Domain.make(arb, callback),
        Error,
        "can't pickify default of 1..6: oops",
      );
    });

    it("throws an Error if the callback returns picks that don't match the generated default", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const callback: PickifyFunction = (v) => {
        if (v === 1) {
          return [123];
        }
        return undefined;
      };
      assertThrows(
        () => Domain.make(arb, callback),
        Error,
        "callback's picks don't match for the default value of 1..6",
      );
    });
  });

  const bit = Domain.make(
    Arbitrary.from(new PickRequest(0, 1)),
    (v) => {
      return (v === 0 || v === 1) ? [v] : undefined;
    },
  );

  const roll = Domain.make(
    Arbitrary.from(new PickRequest(1, 6)),
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
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const dom = Domain.make(arb, (v, sendErr) => {
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

  describe("generate", () => {
    it("throws due to being filtered out", () => {
      const weird = Domain.make(roll.filter((v) => v === 1), (val) => {
        if (val !== 1) throw "oops";
        return [val];
      });
      assertEquals(
        weird.generate([2]),
        {
          ok: false,
          message: "can't build '1..6 (filtered)': picks not accepted",
          actual: [2],
        },
      );
    });
    it("throws due to being filtered out, and without reading all picks", () => {
      const weird = Domain.make(roll.filter((v) => v === 1), (val) => {
        if (val !== 1) throw "oops";
        return [val];
      });
      assertEquals(
        weird.generate([2, 3]),
        {
          ok: false,
          message:
            "can't build '1..6 (filtered)': read only 1 of 2 available picks",
          actual: [2, 3],
        },
      );
    });
    it("returns the value from a successful parse", () => {
      for (let i = 1; i < 6; i++) {
        const gen = roll.generate([i]);
        if (!gen.ok) fail(gen.message);
        assertEquals(gen.val, i);
      }
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
