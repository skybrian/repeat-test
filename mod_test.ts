import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { ChoiceRequest } from "./src/choices.ts";
import SimpleRunner from "./src/simple_runner.ts";
import * as arb from "./src/arbitraries.ts";
import { validRange } from "./src/ranges.ts";

import { SavedChoices } from "./mod.ts";

const runner = new SimpleRunner();

describe("SavedChoices", () => {
  describe("next", () => {
    describe("for empty array", () => {
      const stream = new SavedChoices([]);
      it("chooses the request's default", () => {
        runner.check(validRange, ({ min, max }) => {
          const req = new ChoiceRequest(min, max);
          assertEquals(stream.next(req), req.default);
        });
      });
    });
    describe("for a safe integer", () => {
      it("chooses the integer, when allowed by the request", () => {
        const example = arb.custom((it) => {
          const n = it.gen(arb.safeInt);
          const stream = new SavedChoices([n]);
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
