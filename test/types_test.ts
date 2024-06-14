import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";

import { Arbitrary, ChoiceRequest } from "../src/types.ts";
import SimpleRunner from "../src/simple_runner.ts";
import * as arb from "../src/arbitraries.ts";

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

const runner = new SimpleRunner();

describe("ChoiceRequest", () => {
  it("throws when given an invalid range", () => {
    runner.check(invalidRange, ({ min, max }) => {
      assertThrows(() => new ChoiceRequest(min, max));
    });
  });
});
