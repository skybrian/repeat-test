import { assert } from "@std/assert";

import { type Failure, failure, type Success, success } from "./results.ts";
import { generate, type Generated } from "./generated.ts";
import type { PickSet } from "./generated.ts";
import { PlayoutSearch } from "./searches.ts";
import { Arbitrary } from "./arbitrary_class.ts";

import { pickRandomSeed, randomPickers } from "./random.ts";
import {
  CountingTestConsole,
  FailingTestConsole,
  type TestConsole,
} from "./console.ts";
import type { Coverage, SystemConsole } from "./console.ts";
import { shrink } from "./shrink.ts";

/**
 * A function that runs a test, using generated input.
 *
 * @param console Tests can log output using this interface and they will only
 * be written to the actual console when the test fails.
 */
export type TestFunction<T> = (arg: T, console: TestConsole) => void;

/** Identifies a repetition to run. */
export type RepKey = {
  seed: number;
  index: number;
};

export function parseRepKey(key: string): Success<RepKey> | Failure {
  const fields = key.split(":");
  if (fields.length !== 2) return failure("invalid format");
  const [seed, index] = fields.map((x) => parseInt(x));

  if (!Number.isSafeInteger(seed) || (seed | 0) !== seed) {
    return failure("invalid seed");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    return failure("invalid index");
  }
  return success({ seed, index });
}

export function serializeRepKey(key: RepKey): string {
  return `${key.seed}:${key.index}`;
}

/** A generated test, ready to run. */
export type Rep<T> = {
  ok: true;
  key: RepKey;
  arb: Arbitrary<T>;
  arg: Generated<T>;
  test: TestFunction<T>;
};

export type RepFailure<T> = {
  ok: false;
  key: RepKey;
  arg: T | undefined;
  caught: unknown;
};

/**
 * Generates every possible test argument, in depth-first order.
 *
 * (Since it's not random, the seed is set to zero.)
 */
export function* depthFirstReps<T>(
  arb: Arbitrary<T>,
  test: TestFunction<T>,
): Generator<Rep<T> | RepFailure<T>> {
  // Depth-first order doesnt' work for infinite arbitraries.
  assert(arb.maxSize !== undefined);

  let index = 0;

  const search = new PlayoutSearch();
  while (!search.done) {
    const key: RepKey = { seed: 0, index };
    try {
      const gen = generate(arb, search);
      if (gen === undefined) {
        break; // end of search
      }
      yield { ok: true, key, arb, arg: gen, test };
    } catch (e) {
      yield { ok: false, key, arg: undefined, caught: e };
    }
    index++;
  }
}

/**
 * Generates a stream of Reps based on a random seed.
 *
 * Each Rep will have a different test argument. The first one is always the
 * default value of the Arbitrary. The rest will be chosen randomly, but
 * avoiding duplicates.
 *
 * Since it uses a {@link PlayoutSearch} to avoid generating duplicates, the
 * stream must be generated sequentially, even if the caller skips most of them.
 *
 * If an exception happens in {@link Arbitrary.generate}, a failed Rep will be
 * generated, to be reported by the consumer of the stream.
 *
 * The stream might stop early if no more reps can be generated.
 */
export function* randomReps<T>(
  seed: number,
  arb: Arbitrary<T>,
  test: TestFunction<T>,
): Generator<Rep<T> | RepFailure<unknown>> {
  // All Reps are generated using the same search to avoid duplicates.
  const search = new PlayoutSearch();

  // Dry run: the first test uses the default value.
  const arg = generate(arb, search);
  assert(arg);
  let index = 0;
  const firstRep: Rep<T> = { ok: true, key: { seed, index }, arb, arg, test };
  yield firstRep;
  index++;

  // Generate each rep with an independent random number generator. If some of
  // the Reps take more random numbers due to a code change, it's less likely to
  // affect later Reps.
  //
  // (It's not guaranteed, though, because it will change what's recorded in the
  // PlayoutSearch.)
  const pickers = randomPickers(seed);

  while (!search.done) {
    const key: RepKey = { seed, index };
    search.pickSource = pickers.next().value;
    try {
      const arg = generate(arb, search);
      if (arg === undefined) {
        return; // No more test args to generate.
      }
      yield { ok: true, key, arb, arg, test };
    } catch (e) {
      yield { ok: false, key, arg: undefined, caught: e };
      if (search.state === "picking") {
        search.endPlayout();
      }
    }
    index++;
  }
}

/** Runs one repetition. */
export function runRep<T>(
  rep: Rep<T>,
  system: SystemConsole,
  coverage: Coverage,
): Success<void> | RepFailure<T> {
  const interesting = (arg: T) => {
    const innerConsole = new CountingTestConsole(coverage);
    try {
      rep.test(arg, innerConsole);
      return innerConsole.errorCount > 0;
    } catch (_e) {
      return true;
    }
  };
  if (!interesting(rep.arg.val)) {
    return success();
  }
  system.log("\nTest failed. Shrinking...");
  const shrunk = shrink(rep.arb, interesting, rep.arg);

  // Rerun the test using the shrunk value and the original console.
  const innerConsole = new FailingTestConsole(system);
  try {
    rep.test(shrunk.val, innerConsole);
    if (innerConsole.errorCount > 0) {
      return {
        ok: false,
        key: rep.key,
        arg: shrunk.val,
        caught: new Error("test called console.error()"),
      };
    }
    throw new Error("flaky test passed after shrinking");
  } catch (e) {
    return {
      ok: false,
      key: rep.key,
      arg: shrunk.val,
      caught: e,
    };
  }
}

export function runReps<T>(
  reps: Iterable<Rep<T> | RepFailure<unknown>>,
  count: number,
  console: SystemConsole,
): Success<number> | RepFailure<unknown> {
  let passed = 0;
  const coverage: Coverage = {};
  for (const rep of reps) {
    if (!rep.ok) return rep;
    const ran = runRep(rep, console, coverage);
    if (!ran.ok) return ran;
    passed++;
    if (passed >= count) break;
  }
  for (const key in coverage) {
    const covered = coverage[key];
    if (covered.true === 0) {
      throw new Error(`sometimes(${key}) was never true`);
    }
    if (covered.false === 0) {
      throw new Error(`sometimes(${key}) was never false`);
    }
  }
  return success(passed);
}

export function reportFailure(
  failure: RepFailure<unknown>,
  console: SystemConsole,
): never {
  const key = serializeRepKey(failure.key);
  console.error(`attempt ${failure.key.index + 1} FAILED, using:`, failure.arg);
  console.log(`rerun using {only: "${key}"}`);
  throw failure.caught;
}

/**
 * Options to {@link repeatTest}.
 */
export type RepeatOpts = {
  /** The number of times to run the test. If not specified, defaults to 1000. */
  reps?: number;

  /** If specified, repeatTest will rerun a single rep. */
  only?: string;

  /** If specified, repeatTest will send output to an alternate console. */
  console?: SystemConsole;
};

function getStartKey(opts?: RepeatOpts): RepKey {
  if (!opts?.only) {
    return {
      seed: pickRandomSeed(),
      index: 0,
    };
  }
  const parsed = parseRepKey(opts.only);
  if (!parsed.ok) throw Error(`can't parse 'only' option: ${parsed.message}`);
  return parsed.val;
}

/**
 * Runs a test function repeatedly.
 *
 * If the test input is an array, the test will be run once for each item, in
 * the order given. Similarly for a small Arbitrary (less than 1000 items).
 * Otherwise, a thousand inputs will be chosen randomly. The number of
 * repetitions can be overridden using {@link RepeatOpts.reps}.
 *
 * If the test is considered to have failed if the test function throws. In that
 * case, the test will be run repeatedly to find the smallest input that causes
 * the failure.
 *
 * Information about the test failure and how to rerun the test will be printed
 * to the console.
 *
 * @param input Either a list of test inputs to run in order, or an Arbitrary
 * that will generate inputs.
 * @param test A test function that requires input.
 */
export function repeatTest<T>(
  input: T[] | PickSet<T>,
  test: TestFunction<T>,
  opts?: RepeatOpts,
): void {
  const key = getStartKey(opts);
  const repsOpt = opts?.reps;
  if (repsOpt !== undefined) {
    if (!Number.isInteger(repsOpt)) {
      throw new Error(`reps option must be an integer; got ${repsOpt}`);
    }
    if (repsOpt <= 0) {
      throw new Error(`reps option must be at least 1; got ${repsOpt}`);
    }
  }
  let expectedPlayouts = opts?.reps ?? 1000;
  if (Array.isArray(input)) {
    expectedPlayouts = input.length;
  }
  const arb = Array.isArray(input)
    ? Arbitrary.of(...input)
    : Arbitrary.from(input);

  const runAll = arb.maxSize !== undefined &&
    arb.maxSize <= expectedPlayouts;

  const reps = runAll
    ? depthFirstReps(arb, test)
    : randomReps(key.seed, arb, test);

  // Skip to the iteration that we want to run.
  let skipCount = 0;
  for (let i = 0; i < key.index; i++) {
    if (reps.next().done) {
      break;
    }
    skipCount++;
  }

  const count = opts?.only ? 1 : expectedPlayouts;

  const outerConsole = opts?.console ?? console;
  const ran = runReps(reps, count, outerConsole);
  if (!ran.ok) {
    reportFailure(ran, outerConsole);
  } else if (ran.val === 0) {
    throw new Error(`skipped all ${skipCount} reps`);
  } else if (opts?.only !== undefined) {
    throw new Error(`only option is set`);
  }
}
