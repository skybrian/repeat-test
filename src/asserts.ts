import { assertEquals } from "@std/assert";
import Arbitrary from "./arbitrary_class.ts";
import { NestedPicks } from "./playouts.ts";

import Codec from "../src/codec_class.ts";

export function assertRoundTrip<T>(codec: Codec<T>, val: T) {
  const picks = codec.pickify(val);
  const decoded = codec.parse(picks);
  assertEquals(decoded, val);
}

export function assertEncoding<T>(codec: Codec<T>, picks: number[], val: T) {
  assertEquals(codec.parse(picks), val, `codec.parse(${picks}) failed`);
  assertEquals(codec.pickify(val), picks, `codec.pickify(${val}) failed`);
}

export function assertSameExamples<T>(
  actual: Arbitrary<T>,
  expected: Arbitrary<T>,
) {
  const actualVals = new Set(actual.takeAll());
  const expectedVals = new Set(expected.takeAll());
  assertEquals(actualVals, expectedVals);
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
  assertEquals(arb.take(expected.length), expected);
}

export function assertExamples<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  assertEquals(arb.take(expected.length + 5), expected);
}
