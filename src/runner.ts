import type { Failure, Success } from "./results.ts";
import type { IntPicker } from "./picks.ts";
import type { PickSet } from "./generated.ts";
import type { Gen } from "./gen_class.ts";
import type { Coverage, SystemConsole, TestConsole } from "./console.ts";

import { assert, assertEquals, AssertionError } from "@std/assert";

import { failure, success } from "./results.ts";
import { PickRequest, PlaybackPicker } from "./picks.ts";
import { generate } from "./generated.ts";
import { PartialTracker } from "./searches.ts";
import { Arbitrary } from "./arbitrary_class.ts";
import { generateDefault } from "./multipass_search.ts";
import { pickRandomSeed, randomPicker, randomPickers } from "./random.ts";
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
  /** An offset into the Examples array, or 0 if there's a single Arbitrary. */
  id: number;
  seed: number;
  /** 0 for this example's default value, 1+ for random examples. */
  index: number;
};

function splitKey(key: string): Success<RepKey> | Failure {
  const fields = key.split(":");
  if (fields.length === 1) {
    return success({ id: parseInt(fields[0]), seed: 0, index: 0 });
  } else if (fields.length === 3) {
    return success({
      id: parseInt(fields[0]),
      seed: parseInt(fields[1]),
      index: parseInt(fields[2]),
    });
  }
  return failure("invalid format: ${key}");
}

export function parseRepKey(key: string): Success<RepKey> | Failure {
  const out = splitKey(key);
  if (!out.ok) return out;

  const { id, seed, index } = out.val;
  if (!Number.isSafeInteger(id) || id < 0) {
    return failure("invalid id");
  }
  if (!Number.isSafeInteger(seed) || (seed | 0) !== seed) {
    return failure("invalid seed");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    return failure("invalid index");
  }
  return success({ id, seed, index });
}

export function serializeRepKey(key: RepKey): string {
  if (key.seed === 0 && key.index === 0) {
    return `${key.id}`;
  }
  return `${key.id}:${key.seed}:${key.index}`;
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

export class RepSource<T> {
  readonly search = new PartialTracker();
  readonly pickers: Iterator<IntPicker>;
  randomReps = 0;

  constructor(
    readonly id: number,
    readonly arb: Arbitrary<T>,
    readonly test: TestFunction<T>,
    readonly seed: number,
  ) {
    this.pickers = randomPickers(seed);
  }

  generateDefault(): Rep<T> | RepFailure<T> {
    const def = generateDefault(this.arb);

    // Generate a second time to prune from the search space.
    this.search.pickSource = new PlaybackPicker(def.replies);
    const arg = generate(this.arb, this.search);
    assert(arg !== undefined);
    assertEquals(def.replies, arg.replies);

    const key = { id: this.id, seed: 0, index: 0 };
    return { ok: true, key, arb: this.arb, arg, test: this.test };
  }

  generateRandom(): Rep<T> | RepFailure<T> | undefined {
    this.search.pickSource = this.pickers.next().value;
    this.randomReps++;
    const key = { id: this.id, seed: this.seed, index: this.randomReps };
    try {
      const arg = generate(this.arb, this.search);
      if (arg === undefined) {
        return undefined;
      }
      return { ok: true, key, arb: this.arb, arg, test: this.test };
    } catch (e) {
      if (this.search.state === "picking") {
        this.search.endPlayout();
      }
      return { ok: false, key, arg: undefined, caught: e };
    }
  }
}

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
  sources: RepSource<T>[],
  seed: number,
): Generator<Rep<T> | RepFailure<T>> {
  // Generate the default for each Arbitrary.
  for (const source of sources) {
    yield source.generateDefault();
  }

  // Generate the rest of the reps randomly.
  const picker = randomPicker(seed);
  while (sources.length > 0) {
    const choice = picker.pick(new PickRequest(0, sources.length - 1));
    const src = sources[choice];
    const rep = src.generateRandom();
    if (rep === undefined) {
      sources.splice(choice, 1);
    } else {
      yield rep;
    }
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
  console.error(`attempt FAILED, using:`, failure.arg);
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

function parseOnlyOption(input: string): RepKey {
  const parsed = parseRepKey(input);
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
  const only = opts?.only ? parseOnlyOption(opts.only) : undefined;
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

  const seed = only?.seed ?? pickRandomSeed();

  let sources = arbs.map((arb, id) => {
    return new RepSource(id, arb, test, seed);
  });

  if (only) {
    sources = sources.filter((source) => source.id === only.id);
  }
  const reps = generateReps(sources, seed);

  const startIndex = only?.index ?? 0;

  // Skip to the iteration that we want to run.
  let skipCount = 0;
  for (let i = 0; i < startIndex; i++) {
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
