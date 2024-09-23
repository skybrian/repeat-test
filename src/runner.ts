import type { Failure, Success } from "./results.ts";
import type { Gen } from "./gen_class.ts";
import type { PickSet } from "./generated.ts";
import type { Coverage, SystemConsole, TestConsole } from "./console.ts";

import { assert, assertEquals, AssertionError } from "@std/assert";
import { failure, success } from "./results.ts";
import { generate } from "./generated.ts";
import { PartialTracker } from "./searches.ts";
import { Arbitrary } from "./arbitrary_class.ts";
import { generateDefault } from "./multipass_search.ts";
import { pickRandomSeed, randomPickers } from "./random.ts";
import { CountingTestConsole, FailingTestConsole } from "./console.ts";
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
  arg: Gen<T>;
  test: TestFunction<T>;
};

export type RepFailure<T> = {
  ok: false;
  key: RepKey;
  arg: T | undefined;
  caught: unknown;
};

/**
 * Generates a stream of Reps, first deterministically, then randomly.
 *
 * Each Rep will have a different test argument.
 *
 * The first reps are generated by taking the default value from each Arbitrary.
 * The rest will be chosen randomly, but avoiding duplicates.
 *
 * Since it uses a {@link PartialTracker} to avoid generating duplicates, the
 * stream must be generated sequentially, even if the caller skips most of them.
 *
 * If an exception happens in {@link generate}, a failed Rep will be
 * generated, to be reported by the consumer of the stream.
 *
 * The stream might stop early if no more reps can be generated.
 */
export function* generateReps<T>(
  arbs: Arbitrary<T>[],
  test: TestFunction<T>,
  opts: {
    seed: number;
  },
): Generator<Rep<T> | RepFailure<unknown>> {
  // All Reps are generated using the same tracker to avoid duplicates.
  const search = new PartialTracker();

  const allArbs = Arbitrary.oneOf(...arbs).with({ label: "examples" });

  function makeRep(key: RepKey, arg: Gen<T>): Rep<T> {
    let arb = arbs[0];
    if (arbs.length > 1) {
      // When there is more than one arb to choose from, the first pick chose
      // which child arbitrary to use. Adjust the picks to match the child.
      arg.reqs.shift();
      const pick = arg.replies.shift();
      assert(pick !== undefined, "expected at least one pick");
      arb = arbs[pick];
    }

    return { ok: true, key, arb, arg, test };
  }

  // First generate the default for each Arbitrary.
  let index = 0;
  while (index < arbs.length) {
    const gen = generateDefault(arbs[index]);

    // Need to generate the default again to get the right picks for allArbs.
    let offset = 0;
    let firstTime = true;
    search.pickSource = {
      pick: (req): number => {
        if (firstTime && arbs.length > 1) {
          // The first pick chooses the arbitrary when there is more than one.
          assert(req.min === 0 && req.max === arbs.length - 1);
          firstTime = false;
          return index;
        }
        firstTime = false;

        assert(offset >= 0 && offset < gen.replies.length);
        const result = gen.replies[offset++];
        assert(result >= req.min && result <= req.max);
        return result;
      },
    };

    const arg = generate(allArbs, search);
    assert(arg, "unexpected end of search");
    assertEquals(
      arg.val,
      gen.val,
      "default value didn't generate the same value",
    );

    const rep = makeRep({ seed: 0, index: index }, arg);
    assert(rep.arb === arbs[index], `arbs don't match at index ${index}`);
    yield rep;
    index++;
  }

  const seed = opts.seed;

  // Generate each rep with an independent random number generator. If some of
  // the Reps take more random numbers due to a code change, it's less likely to
  // affect later Reps.
  //
  // (It's not guaranteed, though, because it will change what's recorded in the
  // PartialTracker.)
  const pickers = randomPickers(seed);

  while (!search.done) {
    const key: RepKey = { seed, index: index };
    search.pickSource = pickers.next().value;
    try {
      const arg = generate(allArbs, search);
      if (arg === undefined) {
        return; // No more test args to generate.
      }
      yield makeRep({ seed, index: index }, arg);
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
  const shrunk = shrink(rep.arg, interesting);

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
  let err: AssertionError | undefined = undefined;
  for (const key in coverage) {
    const covered = coverage[key];
    if (covered.true === 0) {
      if (err === undefined) {
        err = new AssertionError(`sometimes(${key}) was never true`);
      }
    }
    if (covered.false === 0) {
      if (err === undefined) {
        err = new AssertionError(`sometimes(${key}) was never false`);
      }
    }
  }
  if (err !== undefined) {
    for (const key in coverage) {
      const covered = coverage[key];
      console.log(
        `sometimes(${key}): true: ${covered.true}, false: ${covered.false}`,
      );
    }
    throw err;
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
  /**
   * The number of times to run the test with random input. If not specified,
   * defaults to 1000.
   */
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
 * Some examples to run using {@link repeatTest}.
 */
export type Examples<T> = PickSet<T> | (T | Arbitrary<T>)[];

/**
 * Runs a test function repeatedly.
 *
 * After running each example (or the default of each Arbitrary), a thousand
 * examples will be chosen randomly. The number of random repetitions can be
 * overridden using {@link RepeatOpts.reps}.
 *
 * A test is considered to have failed if the test function throws or it logs an
 * error using the supplied {@link TestConsole}. In that case, the test will be
 * run repeatedly to find the smallest input that causes the failure (this is
 * called shrinking).
 *
 * Information about the test failure and how to rerun the test will be printed
 * to the console.
 *
 * @param input A source of examples to run.
 * @param test A test function that requires input.
 */
export function repeatTest<T>(
  input: Examples<T>,
  test: TestFunction<T>,
  opts?: RepeatOpts,
): void {
  const key = getStartKey(opts);
  const randomReps = opts?.reps;
  if (randomReps !== undefined) {
    if (!Number.isInteger(randomReps)) {
      throw new Error(
        `reps option must be an integer; got ${randomReps}`,
      );
    }
    if (randomReps < 0) {
      throw new Error(
        `reps option must be non-negative; got ${randomReps}`,
      );
    }
  }

  function convertExample(ex: T | Arbitrary<T>, index: number): Arbitrary<T> {
    return (ex instanceof Arbitrary)
      ? ex
      : Arbitrary.of(ex).with({ label: `example ${index}` });
  }

  const arbs: Arbitrary<T>[] = Array.isArray(input)
    ? input.map(convertExample)
    : [Arbitrary.from(input)];

  const reps = generateReps(arbs, test, { seed: key.seed });

  // Skip to the iteration that we want to run.
  let skipCount = 0;
  for (let i = 0; i < key.index; i++) {
    if (reps.next().done) {
      break;
    }
    skipCount++;
  }

  const count = opts?.only ? 1 : arbs.length + (opts?.reps ?? 1000);

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
