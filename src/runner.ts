import { pickRandomSeed, randomPickers } from "./random.ts";
import { SearchTree } from "./tree_search_picker.ts";
import Arbitrary, { PickFailed } from "./arbitrary_class.ts";
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
  ok: true;
  key: RepKey;
  arg: T;
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

  const tree = new SearchTree(opts.expectedPlayouts);
  const pickers = randomPickers(seed);
  let index = 0;

  // Make sure that the default picks work.
  // (And records them in the tree, so we don't test the default again.)
  const picker = tree.makePicker(arb.makeDefaultPicker());
  const sol = arb.pick(picker);
  if (!sol) {
    throw new Error("can't generate default value of supplied arbitrary");
  }
  const arg = sol.val;
  picker.backTo(0);

  // The first rep always uses the default.
  const key = { seed, index };
  yield { ok: true, key, arg, test };
  index++;

  // Generate each rep with a different picker.
  while (true) {
    const key = { seed, index };

    const random = pickers.next().value;
    // const picker = retryPicker(random, filterLimit);
    const picker = tree.makePicker(random);
    try {
      const sol = arb.pick(picker);
      if (!sol) {
        return; // No more test args to generate.
      }
      yield { ok: true, key, arg: sol.val, test };
    } catch (e) {
      yield { ok: false, key, arg: undefined, caught: e };
    }
    picker.backTo(0);
    index++;
  }
}

function* depthFirstReps<T>(
  arb: Arbitrary<T>,
  test: TestFunction<T>,
): Generator<Rep<T> | TestFailure<unknown>> {
  let index = 0;
  for (const pick of arb.members) {
    const key = { seed: 0, index };
    yield { ok: true, key, arg: pick, test };
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

const defaultReps = 1000;

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
  if (!parsed.ok) return fail("can't parse 'only' parameter");
  return success(parsed.val);
}

/**
 * Runs a test function repeatedly, using the given arbitrary to generate input.
 *
 * If there are fewer test inputs than the number of repetitions wanted, it will
 * run the test function with every possible input. Otherwise, it will run the
 * test function with the default value and then randomly generated inputs.
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
  const key = start.val;

  const expectedPlayouts = opts?.reps ?? defaultReps;
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
