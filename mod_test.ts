import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows, fail } from "@std/assert";
import { Arbitrary, ChoiceRequest } from "./types.ts";
import * as arb from "./simple.ts";

import { SavedChoices } from "./mod.ts";

type Range = { min: number; max: number };

const invalidRange = arb.oneOf<Range>([
  arb.example([{ min: 1, max: 0 }]),
  new Arbitrary((r) => {
    const min = r.gen(arb.safeInt);
    const max = r.gen(arb.strangeNumber);
    return { min, max };
  }),
  new Arbitrary((r) => {
    const min = r.gen(arb.strangeNumber);
    const max = r.gen(arb.safeInt);
    return { min, max };
  }),
]);

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

const runner = new arb.Runner();

describe("NextInt", () => {
  it("throws when given an invalid range", () => {
    runner.check(invalidRange, ({ min, max }) => {
      assertThrows(() => new ChoiceRequest(min, max));
    });
  });
});

describe("RandomChoices", () => {
  describe("gen", () => {
    it("generates numbers in range for a NextInt request", () => {
      // Not using the framework since this is a primitive operation.
      const choices = new arb.RandomChoices();
      const bits = new ChoiceRequest(0, 1);
      const expected = [0, 1];
      const counts = [0, 0];
      for (let i = 0; i < 100; i++) {
        const val = choices.gen(bits);
        if (!expected.includes(val)) {
          fail(`unexpected output from gen(unbiasedInt): ${val}`);
        }
        counts[val]++;
      }
      for (const val of expected) {
        if (counts[val] < 10) {
          fail();
        }
      }
    });
  });
});

describe("SavedChoices", () => {
  describe("gen", () => {
    describe("with an empty array", () => {
      const stream = new SavedChoices([]);
      it("returns min for any valid NextInt request", () => {
        runner.check(validRange, ({ min, max }) => {
          const arb = new ChoiceRequest(min, max);
          assertEquals(stream.gen(arb), min);
        });
      });
    });
    describe("for an array with a safe integer n", () => {
      it("returns n for a NextInt request that includes it", () => {
        const example = new Arbitrary((r) => {
          const n = r.gen(arb.safeInt);
          const stream = new SavedChoices([n]);
          const min = r.gen(arb.biasedInt(Number.MIN_SAFE_INTEGER, n));
          const max = r.gen(arb.biasedInt(n, Number.MAX_SAFE_INTEGER));
          return { n, stream, min, max };
        });
        runner.check(example, ({ n, stream, min, max }) => {
          const arb = new ChoiceRequest(min, max);
          assertEquals(stream.gen(arb), n);
        });
      });
    });
  });
});
