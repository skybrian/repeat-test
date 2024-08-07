import { assert, assertEquals } from "@std/assert";
import { PickSet } from "./pick_function.ts";
import Arbitrary from "./arbitrary_class.ts";
import Domain from "./domain_class.ts";
import * as bfs from "./breadth_first_search.ts";

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
  const actualVals = new Set(bfs.takeAll(actual));
  const expectedVals = new Set(bfs.takeAll(expected));
  assertEquals(actualVals, expectedVals);
}

type Gen<T> = { val: T; picks: number[] };

function takeGen<T>(set: PickSet<T>, n: number): Gen<T>[] {
  return bfs.takeGenerated(set, n).map((gen) => ({
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
  assertEquals(bfs.take(set, expected.length), expected);
}

export function assertValues<T>(
  set: PickSet<T>,
  expected: T[],
) {
  assertEquals(bfs.take(set, expected.length + 5), expected);
}
