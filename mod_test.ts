import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import * as arb from "./simple.ts";

import { SavedChoices } from "./mod.ts";

type Range = { min: number; max: number };

const invalidRange = arb.oneOf<Range>([
  arb.example([{ min: 1, max: 0 }]),
  (r) => {
    const min = r.gen(arb.safeInt);
    const max = r.gen(arb.strangeNumber);
    return { min, max };
  },
  (r) => {
    const min = r.gen(arb.strangeNumber);
    const max = r.gen(arb.safeInt);
    return { min, max };
  },
]);

const validRange = arb.oneOf<Range>([
  arb.example([{ min: 0, max: 0 }, { min: 0, max: 1 }]),
  (r) => {
    const size = r.gen(arb.intFrom(1, 100));
    const min = r.gen(
      arb.intFrom(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - size + 1),
    );
    const max = min + size - 1;
    return { min, max };
  },
]);

const random = new arb.Random();

function validStream(r: arb.Random) {
  const inputs = r.gen(arb.array(arb.safeInt));
  return new SavedChoices(inputs);
}

describe("SavedChoices", () => {
  describe("nextInt", () => {
    it("throws for any invalid ranges", () => {
      const examples = arb.record({
        stream: validStream,
        range: invalidRange,
      });
      random.check(examples, ({ stream, range }) => {
        const { min, max } = range;
        assertThrows(() => stream.nextInt(min, max));
      });
    });
    describe("for an empty array", () => {
      const stream = new SavedChoices([]);
      it("returns min for any valid range", () => {
        random.check(validRange, ({ min, max }) => {
          assertEquals(stream.nextInt(min, max), min);
        });
      });
    });
    describe("for an array with a safe integer", () => {
      it("returns it for any limit that contains it", () => {
        function example(r: arb.Random) {
          const n = r.gen(arb.safeInt);
          const stream = new SavedChoices([n]);
          const min = r.nextInt(Number.MIN_SAFE_INTEGER, n);
          const max = r.nextInt(n, Number.MAX_SAFE_INTEGER);
          return { n, stream, min, max };
        }
        random.check(example, ({ n, stream, min, max }) => {
          assertEquals(stream.nextInt(min, max), n);
        });
      });
    });
  });
});
