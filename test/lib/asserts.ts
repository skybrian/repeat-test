import type { Arbitrary, Pickable } from "../../src/entrypoints/core.ts";
import type { Domain } from "@/core.ts";

import { assert, assertEquals, fail } from "@std/assert";
import { take, takeAll, takeGenerated } from "../../src/ordered.ts";
import { randomPicker } from "../../src/random.ts";
import { usePicker } from "../../src/build.ts";
import { Gen } from "../../src/entrypoints/core.ts";

export function assertRoundTrip<T>(
  dom: Domain<T>,
  val: T,
) {
  const picks = dom.pickify(val, "can't pickify value");
  if (!picks.ok) {
    fail(`${picks.message}:\n${Deno.inspect(val)}`);
  }

  const gen = Gen.build(dom, picks.val);
  if (!gen.ok) {
    fail(
      `${gen.message}\n${Deno.inspect(picks.val)}:\n${Deno.inspect(val)}`,
    );
  }
  assertEquals(gen.val, val, "regenerated value didn't match");
}

export function assertEncoding<T>(
  dom: Domain<T>,
  picks: Iterable<number>,
  val: T,
) {
  const gen = dom.regenerate(val);
  assert(gen.ok, "can't regenerate value");
  assertEquals(gen.val, val, `dom.generate(${picks}) didn't match val`);
}

const samples = 1000;

/**
 * Asserts that the probability of a predicate holding when picking randomly
 * falls within the given range of percentages.
 */
export function assertSometimes<T>(
  input: Pickable<T>,
  predicate: (val: T) => boolean,
  expectedMin: number,
  expectedMax: number,
) {
  expectedMin *= samples / 100;
  expectedMax *= samples / 100;

  const rand = randomPicker(123);
  let count = 0;
  for (let i = 0; i < samples; i++) {
    const val = input.directBuild(usePicker(rand));
    if (predicate(val)) {
      count++;
    }
  }
  assert(count >= expectedMin, `want at least ${expectedMin}, got ${count}`);
  assert(count <= expectedMax, `want at most ${expectedMax}, got ${count}`);
}

export function assertSameExamples<T>(
  actual: Arbitrary<T>,
  expected: Arbitrary<T>,
) {
  const actualVals = new Set(takeAll(actual));
  const expectedVals = new Set(takeAll(expected));
  assertEquals(actualVals, expectedVals);
}

type Generated<T> = { val: T; picks: number[] };

function takeGen<T>(set: Pickable<T>, n: number): Generated<T>[] {
  return takeGenerated(set, n).map((gen) => ({
    val: gen.val,
    picks: Array.from(gen.replies),
  }));
}

export function assertFirstGenerated<T>(
  arb: Arbitrary<T>,
  expected: Generated<T>[],
) {
  assertEquals(takeGen(arb, expected.length), expected);
}

export function assertGenerated<T>(
  set: Pickable<T>,
  expected: Generated<T>[],
) {
  assertEquals(takeGen(set, expected.length + 5), expected);
}

export function assertFirstValues<T>(
  set: Pickable<T>,
  expected: T[],
) {
  assertEquals(take(set, expected.length), expected);
}

export function assertValues<T>(
  set: Pickable<T>,
  expected: T[],
) {
  assertEquals(take(set, expected.length + 5), expected);
}
