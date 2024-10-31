import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows, fail } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import { Arbitrary } from "../src/arbitrary_class.ts";
import { Domain, type PickifyCallback } from "../src/domain_class.ts";

describe("Domain", () => {
  describe("constructor", () => {
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
      const callback: PickifyCallback = (_, sendErr) => {
        sendErr("oops!");
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
      const callback: PickifyCallback = (v) => {
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
        sendErr("not a number");
        return undefined;
      } else if (v < 1 || v > 6) {
        sendErr("not in range");
        return undefined;
      }
      return [v];
    },
  );

  describe("parse", () => {
    it("throws a default error if the callback didn't supply a message", () => {
      assertThrows(() => bit.parse("hello"), Error, "not in domain");
    });
    it("throws a custom error if the callback called sendErr", () => {
      assertThrows(() => roll.parse("hello"), Error, "not a number");
    });
  });

  describe("filter", () => {
    it("rejects values outside the domain with a default error", () => {
      assertThrows(() => bit.parse("hello"), Error, "not in domain");
    });
    it("rejects values outside the domain with a custom error", () => {
      assertThrows(
        () => roll.filter((v) => v === 1).parse(7),
        Error,
        "not in range",
      );
    });
    it("rejects values that have been filtered out", () => {
      assertThrows(
        () => roll.filter((v) => v === 1).parse(2),
        Error,
        "filter rejected value",
      );
    });
  });

  describe("regenerate", () => {
    it("returns a default error if the callback didn't supply one", () => {
      assertEquals(bit.regenerate(2), { ok: false, message: "not in domain" });
    });
  });

  describe("pickify", () => {
    it("returns a default error if the callback didn't supply one", () => {
      assertEquals(bit.pickify(2), { ok: false, message: "not in domain" });
    });
  });

  describe("innerPickify", () => {
    const errs: string[] = [];

    const sendErr = (err: string, opts?: { at: string | number }) => {
      if (opts?.at) {
        errs.push(`${opts.at}: ${err}`);
      } else {
        errs.push(err);
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
          sendErr("oops!", { at: "inner" });
          return undefined;
        }
        return [v];
      });
      assertEquals(dom.innerPickify(2, sendErr, "outer"), undefined);
      assertEquals(errs, ["outer.inner: oops!"]);
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
