import { NumberPicker } from "./picks.ts";
import { RandomPicker } from "./random.ts";
import { Arbitrary, Generator } from "./arbitraries.ts";

const defaultReps = 1000;
const defaultFilterLimit = 1000;

/**
 * Generates an infinite stream of test data from an arbitrary.
 *
 * Unless overridden, the data will be generated at random.
 */
export function* testDataStream<T>(
  arb: Arbitrary<T>,
  opts?: { picker?: NumberPicker; filterLimit?: number },
): IterableIterator<T> {
  const picker = opts?.picker ?? new RandomPicker();
  const maxTries = opts?.filterLimit ?? defaultFilterLimit;
  const input = new Generator(picker, maxTries);
  while (true) {
    yield input.pick(arb);
  }
}

/**
 * A test function that takes generated input.
 */
export type TestFunction<T> = (input: T) => void;

/**
 * Options to {@link repeatTest}.
 */
export type RepeatOptions = {
  /** The number of times to run the test. If not specified, defaults to 1000. */
  reps?: number;
};

/**
 * Runs test functions with randomly generated input.
 */
export class TestRunner {
  readonly seed;
  readonly defaultReps;
  readonly filterLimit;

  private readonly random: RandomPicker;

  constructor(
    opts?: { seed?: number; defaultReps: number; filterLimit?: number },
  ) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.defaultReps = opts?.defaultReps ?? defaultReps;
    this.filterLimit = opts?.filterLimit ?? defaultFilterLimit;
    this.random = new RandomPicker({ seed: this.seed });
  }

  repeat<T>(
    input: Arbitrary<T>,
    test: TestFunction<T>,
    opts?: RepeatOptions,
  ): void {
    const reps = opts?.reps ?? this.defaultReps;

    const randomData = testDataStream(input, {
      picker: this.random,
      filterLimit: this.filterLimit,
    });

    function* testData(): IterableIterator<T> {
      yield input.default;
      yield* randomData;
    }

    let passed = 0;
    let first: T | null = null;
    for (const input of testData()) {
      if (passed === reps) return;
      try {
        test(input);
      } catch (e) {
        if (first !== null) console.log(`attempt 1 passed, using:`, input);
        console.error(`attempt ${passed + 1} FAILED, using:`, input);
        throw e;
      }
      passed++;
      if (passed === 1) {
        first = input;
      }
    }
  }
}

const runner = new TestRunner();

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
  runner.repeat(input, test, opts);
}
