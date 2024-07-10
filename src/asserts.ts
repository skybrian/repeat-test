import { assertEquals, assertThrows } from "@std/assert";
import Arbitrary, { PickFailed } from "./arbitrary_class.ts";
import { NestedPicks } from "./playouts.ts";

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
  assertThrows(() => arb.parse(picks), PickFailed);
}

type NestedSol<T> = { val: T; picks: NestedPicks };

function takeSols<T>(
  arb: Arbitrary<T>,
  n: number,
): NestedSol<T>[] {
  const nested: NestedSol<T>[] = [];
  const sols = arb.solutions;
  for (let i = 0; i < n; i++) {
    const sol = sols.next();
    if (sol.done) break;
    nested.push({
      val: sol.value.val,
      picks: sol.value.playout.toNestedPicks(),
    });
  }
  return nested;
}

export function assertFirstSolutions<T>(
  arb: Arbitrary<T>,
  expected: NestedSol<T>[],
) {
  assertEquals(takeSols(arb, expected.length), expected);
}

export function assertSolutions<T>(
  arb: Arbitrary<T>,
  expected: NestedSol<T>[],
) {
  const actual = takeSols(arb, expected.length + 5);
  assertEquals(actual, expected);
}
