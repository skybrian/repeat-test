import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";

import { IntRequest } from "../src/picks.ts";
import { Domain, ParseError } from "../src/domain_class.ts";

describe("ParseError", () => {
  it("pretty-prints the actual value", () => {
    const err = new ParseError("oops", { a: 123 });
    assertStringIncludes(Deno.inspect(err), `{ a: 123 }`);
  });
});

const sixSided = new IntRequest(1, 6);
const bit = Domain.make(
  new IntRequest(0, 1),
  (val) => val === 0 || val === 1 ? [val] : undefined,
);

describe("Domain", () => {
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
});
