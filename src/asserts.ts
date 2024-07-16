import { assertEquals, assertThrows } from "@std/assert";
import { PlayoutPruned } from "./backtracking.ts";
import Arbitrary from "./arbitrary_class.ts";
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
  assertThrows(() => arb.parse(picks), PlayoutPruned);
}

function take<T>(it: Iterator<T>, n: number): T[] {
  const result: T[] = [];

  let count = 0;
  for (let next = it.next(); !next.done && count < n; next = it.next()) {
    result.push(next.value);
    count++;
  }

  return result;
}

type NestedSol<T> = { val: T; picks: NestedPicks };

function takeSols<T>(
  arb: Arbitrary<T>,
  n: number,
): NestedSol<T>[] {
  return take(arb.solutions, n).map((sol) => ({
    val: sol.val,
    picks: sol.playout.toNestedPicks(),
  }));
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

export function assertFirstExamples<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  const actual = take(arb.examples(), expected.length);
  assertEquals(actual, expected);
}

export function assertExamples<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  const actual = take(arb.examples(), expected.length + 5);
  assertEquals(actual, expected);
}
