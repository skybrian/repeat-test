import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { Arbitrary, ChoiceRequest } from "./src/types.ts";
import SimpleRunner from "./src/simple_runner.ts";
import * as arb from "./src/arbitraries.ts";

import { SavedChoices } from "./mod.ts";

type Range = { min: number; max: number };

const validRange = arb.oneOf<Range>([
  arb.example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
  new Arbitrary((r) => {
    const size = r.gen(arb.biasedInt(1, 100));
    const min = r.gen(
      arb.biasedInt(
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER - size + 1,
      ),
    );
    const max = min + size - 1;
    return { min, max };
  }),
]);

const runner = new SimpleRunner();

describe("SavedChoices", () => {
  describe("next", () => {
    describe("for empty array", () => {
      const stream = new SavedChoices([]);
      it("returns min for any valid ChoiceRequest", () => {
        runner.check(validRange, ({ min, max }) => {
          const req = new ChoiceRequest(min, max);
          assertEquals(stream.next(req), min);
        });
      });
    });
    describe("for a safe integer", () => {
      it("returns the integer for any ChoiceRequest that allows it", () => {
        const example = new Arbitrary((r) => {
          const n = r.gen(arb.safeInt);
          const stream = new SavedChoices([n]);
          const min = r.gen(arb.biasedInt(Number.MIN_SAFE_INTEGER, n));
          const max = r.gen(arb.biasedInt(n, Number.MAX_SAFE_INTEGER));
          return { n, stream, min, max };
        });
        runner.check(example, ({ n, stream, min, max }) => {
          const req = new ChoiceRequest(min, max);
          assertEquals(stream.next(req), n);
        });
      });
    });
  });
});
