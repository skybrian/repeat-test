import { assertEquals } from "@std/assert";
import Arbitrary from "./arbitrary_class.ts";

export function assertParses<T>(
  arb: Arbitrary<T>,
  picks: number[],
  expected: T,
) {
  assertEquals(arb.parse(picks), { ok: true, val: expected });
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
