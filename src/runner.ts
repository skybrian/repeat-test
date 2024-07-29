import { pickRandomSeed, randomPickers } from "./random.ts";
import { PlayoutSearch } from "./searches.ts";
import Arbitrary, { Generated } from "./arbitrary_class.ts";
import { Failure, failure, Success, success } from "./results.ts";
import { shrink } from "./shrink.ts";

/** A function that runs a test, using generated input. */
export type TestFunction<T> = (arg: T) => void;

/** Identifies a repetition to generate and run. */
export type RepKey = {
  seed: number;
  index: number;
};

export function parseRepKey(key: string): Success<RepKey> | Failure {
  const fields = key.split(":");
  if (fields.length !== 2) return failure("invalid key format");
  const [seed, index] = fields.map((x) => parseInt(x));

  if (!Number.isSafeInteger(seed) || (seed | 0) !== seed) {
    return failure("invalid seed in key");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    return failure("invalid index in key");
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

export interface TestFailure<T> extends Failure {
  ok: false;
  key: RepKey;
  arg: T;
  caught: unknown;
}

// const defaultFilterLimit = 1000;

export type RandomRepsOpts = {
  expectedPlayouts: number;
  // TODO: reenable, with tests:
  // filterLimit?: number;
};

/** Returns a stream of reps, ready to run. */
export function* randomReps<T>(
  seed: number,
  arb: Arbitrary<T>,
  test: TestFunction<T>,
  opts: RandomRepsOpts,
): Generator<Rep<T> | TestFailure<unknown>> {
  // TODO: figure out how to skip ahead.

  const search = new PlayoutSearch({
    expectedPlayouts: opts.expectedPlayouts,
  });

  const pickers = randomPickers(seed);
  let index = 0;

  // Make sure that the default picks work.
  // (Since this is part of the same search, we won't test the default again.)
  const arg = arb.generate(search);
  if (arg === undefined) {
    throw new Error("can't generate default value of supplied arbitrary");
  }

  // The first rep always uses the default.
  const key = { seed, index };
  yield { ok: true, key, arb, arg, test };
  index++;

  // Generate each rep with a different picker.
  while (!search.done) {
    const key = { seed, index };
    const random = pickers.next().value;
    search.setOptions({ pickSource: random });
    try {
      const arg = arb.generate(search);
      if (arg === undefined) {
        return; // No more test args to generate.
      }
      yield { ok: true, key, arb, arg, test };
    } catch (e) {
      yield { ok: false, key, arg: undefined, caught: e };
    }
    index++;
  }
}

export function* depthFirstReps<T>(
  arb: Arbitrary<T>,
  test: TestFunction<T>,
): Generator<Rep<T> | TestFailure<unknown>> {
  let index = 0;
  for (const arg of arb.generateAll()) {
    const key = { seed: 0, index };
    yield { ok: true, key, arb, arg, test };
    index++;
  }
}

export function reportFailure(failure: TestFailure<unknown>): never {
  const key = serializeRepKey(failure.key);
  console.error(`attempt ${failure.key.index} FAILED, using:`, failure.arg);
  console.log(`rerun using {only: "${key}"}`);
  throw failure.caught;
}

/** Runs one repetition. */
export function runRep<T>(rep: Rep<T>): Success<void> | TestFailure<T> {
  const interesting = (arg: T) => {
    try {
      rep.test(arg);
      return false;
    } catch (_e) {
      return true;
    }
  };
  if (!interesting(rep.arg.val)) {
    return success();
  }
  console.log("\nTest failed. Shrinking...");
  const shrunk = shrink(rep.arb, interesting, rep.arg);
  try {
    rep.test(shrunk.val);
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
  reps: Iterable<Rep<T> | TestFailure<unknown>>,
  count: number,
): Success<void> | TestFailure<unknown> {
  if (count === 0) return success();

  let passed = 0;
  for (const rep of reps) {
    if (!rep.ok) return rep;
    const ran = runRep(rep);
    if (!ran.ok) return ran;
    passed++;
    if (passed >= count) break;
  }
  return success();
}

/**
 * Options to {@link repeatTest}.
 */
export type RepeatOptions = {
  /** The number of times to run the test. If not specified, defaults to 1000. */
  reps?: number;
  // TODO: reenable filterLimit with tests
  // filterLimit?: number;
  /** If specified, it will rerun the repetition that failed */
  only?: string;
};

function getStartKey(opts?: RepeatOptions): Success<RepKey> | Failure {
  if (!opts?.only) {
    return success({
      seed: pickRandomSeed(),
      index: 0,
    });
  }
  const parsed = parseRepKey(opts.only);
  if (!parsed.ok) return failure("can't parse 'only' parameter");
  return success(parsed.val);
}

/**
 * Runs a test function repeatedly.
 *
 * If the test input is an array, the test will be run once for each item, in
 * the order given. Similarly for a small Arbitrary (less than 1000 items).
 * Otherwise, a thousand inputs will be chosen randomly. The number of
 * repetitions can be overridden using {@link RepeatOptions.reps}.
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
  input: T[] | Arbitrary<T>,
  test: TestFunction<T>,
  opts?: RepeatOptions,
): void {
  let expectedPlayouts = opts?.reps ?? 1000;
  if (Array.isArray(input)) {
    expectedPlayouts = input.length;
    input = Arbitrary.from(input);
  }
  const start = getStartKey(opts);
  if (!start.ok) throw new Error(start.message ?? "can't get start key");
  const key = start.val;

  const runAll = input.maxSize !== undefined &&
    input.maxSize <= expectedPlayouts;

  const genOpts: RandomRepsOpts = { expectedPlayouts };

  const reps = runAll
    ? depthFirstReps(input, test)
    : randomReps(key.seed, input, test, genOpts);

  // Skip to the iteration that we want to run.
  for (let i = 0; i < key.index; i++) {
    if (reps.next().done) {
      throw new Error(
        `tried to skip ${key.index} values but there were only ${i} available`,
      );
    }
  }

  const count = opts?.only ? 1 : expectedPlayouts;
  const ran = runReps(reps, count);
  if (!ran.ok) reportFailure(ran);
}
