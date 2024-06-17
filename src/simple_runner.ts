import { Choices } from "./choices.ts";
import { RandomChoices } from "./random.ts";
import { Arbitrary, ArbitraryInput } from "./arbitraries.ts";

/**
 * Generates an infinite stream of test data from an arbitrary.
 *
 * Unless overridden, the data will be generated at random.
 */
export function* testDataStream<T>(
  arb: Arbitrary<T>,
  opts?: { choices?: Choices; filterLimit?: number },
): IterableIterator<T> {
  const choices = opts?.choices ?? new RandomChoices();
  const maxTries = opts?.filterLimit ?? 100;
  const input = new ArbitraryInput(choices, maxTries);
  while (true) {
    yield input.gen(arb);
  }
}

/**
 * Runs test functions with randomly generated input.
 */
export default class TestRunner {
  readonly seed;
  readonly defaultReps;
  readonly filterLimit;

  private readonly random: RandomChoices;

  constructor(
    opts?: { seed?: number; defaultReps: number; filterLimit?: number },
  ) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.defaultReps = opts?.defaultReps ?? 100;
    this.filterLimit = opts?.filterLimit ?? 100;
    this.random = new RandomChoices({ seed: this.seed });
  }

  /**
   * Runs a test function repeatedly with randomly generated input.
   * @param input An arbitrary used to generate the input.
   * @param test A test function that requires input.
   * @param opts.reps The number of times to run the test. If not specified
   * either here or in the constructor, defaults to 100.
   */
  repeat<T>(
    input: Arbitrary<T>,
    test: (input: T) => void,
    opts?: { reps?: number },
  ): void {
    const reps = opts?.reps ?? this.defaultReps;

    const randomData = testDataStream(input, {
      choices: this.random,
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
