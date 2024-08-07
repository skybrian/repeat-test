import { assert, assertEquals } from "@std/assert";
import Arbitrary, { PickSet } from "./arbitrary_class.ts";

import Domain from "./domain_class.ts";

export function assertRoundTrip<T>(dom: Domain<T>, val: T) {
  assertEquals(dom.parse(val), val, "regenerated value didn't match");
}

export function assertEncoding<T>(dom: Domain<T>, picks: number[], val: T) {
  const gen = dom.regenerate(val);
  assert(gen.ok, "can't regenerate value");
  assertEquals(gen.val, val, `dom.generate(${picks}) didn't match val`);
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

type Gen<T> = { val: T; picks: number[] };

function takeGen<T>(arb: Arbitrary<T>, n: number): Gen<T>[] {
  return take(arb.generateAll(), n).map((gen) => ({
    val: gen.val,
    picks: gen.replies(),
  }));
}

export function assertFirstGenerated<T>(
  arb: Arbitrary<T>,
  expected: Gen<T>[],
) {
  assertEquals(takeGen(arb, expected.length), expected);
}

export function assertGenerated<T>(
  arb: Arbitrary<T>,
  expected: Gen<T>[],
) {
  assertEquals(takeGen(arb, expected.length + 5), expected);
}

export function assertFirstValues<T>(
  arb: Arbitrary<T>,
  expected: T[],
) {
  assertEquals(arb.take(expected.length), expected);
}

export function assertValues<T>(
  set: PickSet<T>,
  expected: T[],
) {
  assertEquals(Arbitrary.from(set).take(expected.length + 5), expected);
}
