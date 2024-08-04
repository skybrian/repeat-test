import { assertEquals, fail } from "@std/assert";
import Arbitrary, { PickSet } from "./arbitrary_class.ts";

import Domain from "./domain_class.ts";

export function assertRoundTrip<T>(dom: Domain<T>, val: T) {
  const copy = dom.regenerate(val);
  assertEquals(copy?.val, val);
}

export function assertEncoding<T>(dom: Domain<T>, picks: number[], val: T) {
  assertEquals(
    dom.parsePicks(picks).val,
    val,
    `dom.parsePicks(${picks}) value didn't match`,
  );

  let error: string | undefined;
  const sendErr = (msg: string) => {
    error = msg;
  };
  const parsed = dom.innerPickify(val, sendErr);
  if (parsed === undefined) {
    const msg = `failed with: ${error}` ?? "returned undefined";
    fail(`dom.innerPickify(${val}) ${msg}`);
  }
  assertEquals(
    parsed,
    picks,
    `dom.maybePickify(${val}) picks didn't match`,
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
  assertEquals(set.arb.take(expected.length + 5), expected);
}
