import { assertEquals, assertThrows } from "@std/assert";
import Arbitrary from "./arbitrary_class.ts";
import { NestedPicks, PlayoutFailed } from "./playouts.ts";

export function assertParses<T>(
  arb: Arbitrary<T>,
  picks: number[],
  expected: T,
) {
  assertEquals(arb.parse(picks), expected);
}

export function assertParseFails<T>(
  arb: Arbitrary<T>,
  picks: number[],
) {
  assertThrows(() => arb.parse(picks), PlayoutFailed);
}

export function assertSolutions<T>(
  arb: Arbitrary<T>,
  expected: { val: T; picks: NestedPicks }[],
) {
  const sols = Array.from(arb.solutions);
  const actual = sols.map((s) => ({
    val: s.val,
    picks: s.playout.getNestedPicks(),
  }));
  assertEquals(actual, expected);
}
