import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import { ChoiceRequest } from "../src/choices.ts";
import SimpleRunner from "../src/simple_runner.ts";
import * as arb from "../src/arbitraries.ts";
import { validRange } from "../src/ranges.ts";

import { ArrayChoices } from "../src/simple_choices.ts";

const runner = new SimpleRunner();

describe("ArrayChoices", () => {
  describe("next", () => {
    describe("for empty array", () => {
      const stream = new ArrayChoices([]);

      it("chooses the request's default and fails", () => {
        runner.check(validRange, ({ min, max }) => {
          const req = new ChoiceRequest(min, max);
          assertEquals(stream.next(req), req.default);
          assert(stream.failed);
          assertEquals(stream.failureOffset, 0);
        });
      });
    });
    describe("for an array containing a safe integer", () => {
      it("chooses the integer, when allowed by the request", () => {
        const example = arb.custom((it) => {
          const n = it.gen(arb.safeInt);
          const stream = new ArrayChoices([n]);
          const min = it.gen(arb.biasedInt(Number.MIN_SAFE_INTEGER, n));
          const max = it.gen(arb.biasedInt(n, Number.MAX_SAFE_INTEGER));
          const req = new ChoiceRequest(min, max);
          return { n, stream, req };
        });
        runner.check(example, ({ n, stream, req }) => {
          assertEquals(stream.next(req), n);
        });
      });
    });
  });
});
