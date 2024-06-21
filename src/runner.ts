import { pickRandomSeed, randomPickers } from "./random.ts";
import { Arbitrary, makePickFunction } from "./arbitraries.ts";
import { fail, Failure, Success, success } from "./results.ts";

/** A function that runs a test, using generated input. */
export type TestFunction<T> = (arg: T) => void;

/** Identifies a repetition to generate and run. */
export type RepKey = {
  seed: number;
  index: number;
};

export function parseRepKey(key: string): Success<RepKey> | Failure {
  const fields = key.split(":");
  if (fields.length !== 2) return fail("invalid key format");
  const [seed, index] = fields.map((x) => parseInt(x));

  if (!Number.isSafeInteger(seed) || (seed | 0) !== seed) {
    return fail("invalid seed in key");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    return fail("invalid index in key");
  }
  return success({ seed, index });
}

export function serializeRepKey(key: RepKey): string {
  return `${key.seed}:${key.index}`;
}

/** A generated test, ready to run. */
export type Rep<T> = {
  key: RepKey;
  arg: T;
  test: TestFunction<T>;
};

const defaultFilterLimit = 1000;

/** Returns a stream of reps, ready to run. */
export function* generateReps<T>(
  start: RepKey,
  arb: Arbitrary<T>,
  test: TestFunction<T>,
  opts?: { filterLimit?: number },
): Generator<Rep<T>> {
  const seed = start.seed;
  const skip = start.index;
  const filterLimit = opts?.filterLimit ?? defaultFilterLimit;

  const pickers = randomPickers(start.seed);
  let index = 0;

  // Unless skipped, run the first rep using the arb's default value (dry run).
  if (skip === 0) {
    const key = { seed, index };
    yield { key, arg: arb.default, test };
  }
  index++;

  // Skip ahead to the tests we want to run.
  while (index < skip) {
    pickers.next();
    index++;
  }

  // Generate each rep with a different picker.
  while (true) {
    const picker = pickers.next().value;
    const pick = makePickFunction(picker, filterLimit);
    const key = { seed, index };
    index++;
    yield { key, arg: pick(arb), test };
  }
}

export interface TestFailure<T> extends Failure {
  key: RepKey;
  arg: T;
  caught: unknown;
}

export function reportFailure<T>(failure: TestFailure<T>): never {
  const key = serializeRepKey(failure.key);
  console.error(`attempt ${failure.key.index} FAILED, using:`, failure.arg);
  console.log(`rerun using {only: "${key}"}`);
  throw failure.caught;
}

/** Runs one repetition. */
export function runRep<T>(rep: Rep<T>): Success<void> | TestFailure<T> {
  try {
    rep.test(rep.arg);
    return success();
  } catch (e) {
    return {
      ok: false,
      key: rep.key,
      arg: rep.arg,
      caught: e,
    };
  }
}

export function runReps<T>(
  reps: Iterable<Rep<T>>,
  count: number,
): Success<void> | TestFailure<T> {
  if (count === 0) return success();

  let passed = 0;
  for (const rep of reps) {
    const ran = runRep(rep);
    if (!ran.ok) return ran;
    passed++;
    if (passed >= count) break;
  }
  return success();
}

const defaultReps = 1000;

/**
 * Options to {@link repeatTest}.
 */
export type RepeatOptions = {
  /** The number of times to run the test. If not specified, defaults to 1000. */
  reps?: number;
  filterLimit?: number;
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
  if (!parsed.ok) return fail("can't parse 'only' parameter");
  return success(parsed.val);
}

/**
 * Runs a test function repeatedly, using randomly generated input.
 *
 * @param input An arbitrary used to generate input.
 * @param test A test function that requires input.
 */
export function repeatTest<T>(
  input: Arbitrary<T>,
  test: TestFunction<T>,
  opts?: RepeatOptions,
): void {
  const start = getStartKey(opts);
  if (!start.ok) throw new Error(start.message ?? "can't get start key");

  const genOpts = { filterLimit: opts?.filterLimit };
  const reps = generateReps(start.val, input, test, genOpts);

  const count = opts?.only ? 1 : opts?.reps ?? defaultReps;
  const ran = runReps(reps, count);
  if (!ran.ok) reportFailure(ran);
}
