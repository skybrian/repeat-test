import { assertEquals } from "@std/assert";
import Arbitrary from "./arbitrary_class.ts";
import { NestedPicks } from "./spans.ts";

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

type Nested<T> = { val: T; picks: NestedPicks };

function takeVals<T>(
  arb: Arbitrary<T>,
  n: number,
): Nested<T>[] {
  return take(arb.generateAll(), n).map((gen) => ({
    val: gen.val,
    picks: gen.nestedPicks(),
  }));
}

export function assertFirstNested<T>(
  arb: Arbitrary<T>,
  expected: Nested<T>[],
) {
  assertEquals(takeVals(arb, expected.length), expected);
}

export function assertNested<T>(
  arb: Arbitrary<T>,
  expected: Nested<T>[],
) {
  const actual = takeVals(arb, expected.length + 5);
  assertEquals(actual, expected);
}

export function assertFirstValues<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  assertEquals(arb.take(expected.length), expected);
}

export function assertValues<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  assertEquals(arb.take(expected.length + 5), expected);
}
