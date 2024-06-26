import { assertEquals } from "@std/assert";
import Arbitrary from "./arbitrary_class.ts";
import { NestedPicks } from "./playouts.ts";

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

export function assertSolutions<T>(
  arb: Arbitrary<T>,
  expected: { val: T; picks: NestedPicks }[],
) {
  const sols = Array.from(arb.solutions);
  const actual = sols.map((s) => ({ val: s.val, picks: s.getNestedPicks() }));
  assertEquals(actual, expected);
}
