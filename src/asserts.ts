import { assertEquals } from "@std/assert";
import { Arbitrary } from "./arbitraries/core.ts";

export function assertParses<T>(
  arb: Arbitrary<T>,
  choices: number[],
  expected: T,
) {
  assertEquals(arb.parse(choices), { ok: true, value: expected });
}

export function assertParseFails<T>(
  arb: Arbitrary<T>,
  choices: number[],
  guess: T,
  expectedErrorOffset: number,
) {
  assertEquals(arb.parse(choices), {
    ok: false,
    guess,
    errorOffset: expectedErrorOffset,
  });
}
