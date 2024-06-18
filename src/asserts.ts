import { assertEquals } from "@std/assert";
import { Arbitrary } from "./arbitraries/core.ts";

export function assertParses<T>(
  arb: Arbitrary<T>,
  picks: number[],
  expected: T,
) {
  assertEquals(arb.parse(picks), { ok: true, value: expected });
}

export function assertParseFails<T>(
  arb: Arbitrary<T>,
  picks: number[],
  guess: T,
  expectedErrorOffset: number,
) {
  assertEquals(arb.parse(picks), {
    ok: false,
    guess,
    errorOffset: expectedErrorOffset,
  });
}
