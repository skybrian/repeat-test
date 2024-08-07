import { assert, assertEquals } from "@std/assert";
import { PickSet } from "./pick_function.ts";
import Arbitrary from "./arbitrary_class.ts";
import Domain from "./domain_class.ts";
import {
  generateBreadthFirst,
  takeAllBreadthFirst,
  takeBreadthFirst,
} from "./searches.ts";

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
  const actualVals = new Set(takeAllBreadthFirst(actual));
  const expectedVals = new Set(takeAllBreadthFirst(expected));
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

function takeGen<T>(set: PickSet<T>, n: number): Gen<T>[] {
  return take(generateBreadthFirst(set), n).map((gen) => ({
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
  set: PickSet<T>,
  expected: T[],
) {
  assertEquals(takeBreadthFirst(set, expected.length), expected);
}

export function assertValues<T>(
  set: PickSet<T>,
  expected: T[],
) {
  assertEquals(takeBreadthFirst(set, expected.length + 5), expected);
}
