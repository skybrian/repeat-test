import { randomPickers } from "./random.ts";
import { Arbitrary, makePickFunction } from "./arbitraries.ts";
import { IntPicker } from "./picks.ts";

const defaultReps = 1000;
const defaultFilterLimit = 1000;

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
  filterLimit?: number;
  /** If specified, it will rerun the repetition that failed */
  only?: string;
};

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
  const filterLimit = opts?.filterLimit ?? defaultFilterLimit;

  let firstData: T | null = null;

  function runOnce(attempt: number, picker: IntPicker, seed: number): T {
    const pick = makePickFunction(picker, filterLimit);

    const data = (attempt == 0) ? input.default : pick(input);
    try {
      test(data);
      return data;
    } catch (e) {
      if (firstData !== null) {
        console.log(`attempt 0 passed, using:`, firstData);
      }
      console.error(`attempt ${attempt} FAILED, using:`, data);
      console.log(`rerun using only="${seed}:${attempt}"`);
      throw e;
    }
  }

  function runAll() {
    const reps = opts?.reps ?? defaultReps;
    const seed = Date.now() ^ (Math.random() * 0x100000000);
    const pickers = randomPickers(seed);

    for (let i = 0; i < reps; i++) {
      const picker = pickers.next().value;
      const data: T = runOnce(i, picker, seed);
      if (i === 0) {
        firstData = data;
      }
    }
  }

  if (opts?.only) {
    const [seed, attempt] = opts.only.split(":").map((x) => parseInt(x));
    const pickers = randomPickers(seed);
    for (let j = 0; j < attempt; j++) {
      pickers.next();
    }
    runOnce(attempt, pickers.next().value, seed);
  } else {
    runAll();
  }
}
