import { assertEquals, assertThrows } from "@std/assert";
import { PlayoutPruned } from "./backtracking.ts";
import Arbitrary from "./arbitrary_class.ts";
import { NestedPicks } from "./playouts.ts";

import Codec from "../src/codec_class.ts";

export function assertRoundTrip<T>(codec: Codec<T>, input: T) {
  const encoded = codec.encode(input);
  const decoded = codec.decode(encoded);
  assertEquals(decoded, input);
}

export function assertEncoding<T>(codec: Codec<T>, picks: number[], result: T) {
  assertEquals(
    codec.decode(picks),
    result,
    `codec.decode(${picks}) returned an unexpected result`,
  );
  assertEquals(
    codec.encode(result),
    picks,
    `codec.encode(${result}) returned an unexpected result`,
  );
}

export function assertSameExamples<T>(
  actual: Arbitrary<T>,
  expected: Arbitrary<T>,
) {
  const actualVals = new Set(actual.takeAll());
  const expectedVals = new Set(expected.takeAll());
  assertEquals(actualVals, expectedVals);
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
  assertEquals(arb.take(expected.length), expected);
}

export function assertExamples<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  assertEquals(arb.take(expected.length + 5), expected);
}
