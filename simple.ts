import prand from "pure-rand";

/**
 * An infinite stream of choices. Each choice is a number.
 */
export interface Choices {
  /**
   * Returns the next choice as a safe integer in the given range.
   * Min and max must be safe integers, with min <= max.
   */
  nextInt(min: number, max: number): number;
}

export type Generator<T> = (r: RandomChoices) => T;

export class RandomChoices implements Choices {
  readonly seed;
  private readonly rng: prand.RandomGenerator;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.rng = prand.xoroshiro128plus(this.seed);
  }

  /**
   * Returns a signed 32-bit integer.
   * -(2 ** 31) <= n <= (2 ** 31) - 1.
   */
  nextInt32(): number {
    return this.rng.unsafeNext();
  }

  nextBool(): boolean {
    const val = this.nextInt32();
    return val >= 0;
  }

  /**
   * Returns an integer between min and max.
   * min <= n <= max.
   */
  nextInt(min: number, max: number): number {
    return prand.unsafeUniformIntDistribution(min, max, this.rng);
  }

  nextMember<T>(items: T[]): T {
    if (items.length === 0) {
      throw new Error("Can't choose an item from an empty array");
    }
    const index = this.nextInt(0, items.length - 1);
    return items[index];
  }

  gen<T>(g: Generator<T>): T {
    return g(this);
  }

  samples<T>(generator: Generator<T>, count = 100): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(generator(this));
    }
    return result;
  }
}

export class Runner {
  readonly seed;
  private readonly random: RandomChoices;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.random = new RandomChoices({ seed: this.seed });
  }

  check<T>(examples: Generator<T>, run: (example: T) => void): void {
    const debug = false;

    let first = true;
    for (const example of this.random.samples(examples, 100)) {
      if (first && debug) {
        console.log("First example:", example);
      }
      first = false;
      try {
        run(example);
      } catch (e) {
        console.log("Failed! Example:", example);
        throw e;
      }
    }
  }
}

/**
 * Returns an integer between min and max.
 * For large ranges, the choice will be biased towards special cases.
 */
export function intFrom(min: number, max: number): Generator<number> {
  const size = max - min + 1;
  if (size <= 10) {
    return (r) => r.nextInt(min, max);
  }
  return (r) => {
    switch (r.nextInt(1, 20)) {
      case 1:
        return min;
      case 2:
        return max;
      case 3:
        if (min <= 0 && max >= 0) return 0;
    }
    return r.nextInt(min, max);
  };
}

export const safeInt = intFrom(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
);

export function example<T>(values: T[]): Generator<T> {
  if (values.length === 0) {
    throw new Error("Can't choose an example from an empty array");
  }
  if (values.length === 1) {
    return () => values[0];
  }
  return (r) => values[r.nextInt(0, values.length - 1)];
}

export function oneOf<T>(args: Generator<T>[]): Generator<T> {
  if (args.length === 0) {
    throw new Error("Can't choose an item from an empty array");
  }
  if (args.length === 1) {
    return args[0];
  }
  return (r) => {
    const choice = r.gen(example(args));
    return r.gen(choice);
  };
}

export const strangeNumber = example([
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
]);

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...generators: { [K in keyof T]: Generator<T[K]> }
): Generator<T> {
  return (r) => generators.map((g) => r.gen(g)) as T;
}

export function array<T>(
  generator: Generator<T>,
  opts?: { min: number; max: number },
): Generator<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return (r) => {
    const length = r.gen(intFrom(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(r.gen(generator));
    }
    return result;
  };
}

type AnyRecord = Record<string, unknown>;
type RecordShape<T extends AnyRecord> = { [K in keyof T]: Generator<T[K]> };

export function record<T extends AnyRecord>(
  generators: RecordShape<T>,
): Generator<T> {
  return (r) => {
    const keys = Object.keys(generators) as (keyof T)[];
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = r.gen(generators[key]);
    }
    return result as T;
  };
}
