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

  gen<T>(arb: Arbitrary<T>): T {
    return arb.generator(this);
  }

  samples<T>(arb: Arbitrary<T>, count = 100): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.gen(arb));
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

  check<T>(examples: Arbitrary<T>, run: (example: T) => void): void {
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

export class Arbitrary<T> {
  constructor(readonly generator: Generator<T>) {}
}

/**
 * Returns an integer between min and max.
 * For large ranges, the choice will be biased towards special cases.
 */
export function intFrom(min: number, max: number): Arbitrary<number> {
  const size = max - min + 1;
  if (size <= 10) {
    return new Arbitrary((r) => r.nextInt(min, max));
  }
  return new Arbitrary((r) => {
    switch (r.nextInt(1, 20)) {
      case 1:
        return min;
      case 2:
        return max;
      case 3:
        if (min <= 0 && max >= 0) return 0;
    }
    return r.nextInt(min, max);
  });
}

export const safeInt = intFrom(
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
);

export function example<T>(values: T[]): Arbitrary<T> {
  if (values.length === 0) {
    throw new Error("Can't choose an example from an empty array");
  }
  if (values.length === 1) {
    return new Arbitrary(() => values[0]);
  }
  return new Arbitrary((r) => values[r.nextInt(0, values.length - 1)]);
}

export function oneOf<T>(args: Arbitrary<T>[]): Arbitrary<T> {
  if (args.length === 0) {
    throw new Error("Can't choose an item from an empty array");
  }
  if (args.length === 1) {
    return args[0];
  }
  return new Arbitrary((r) => {
    const choice = r.gen(example(args));
    return r.gen(choice);
  });
}

export const strangeNumber = example([
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
]);

type AnyTuple = unknown[];

export function tuple<T extends AnyTuple>(
  ...items: { [K in keyof T]: Arbitrary<T[K]> }
): Arbitrary<T> {
  return new Arbitrary((r) => items.map((g) => r.gen(g)) as T);
}

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min: number; max: number },
): Arbitrary<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return new Arbitrary((r) => {
    const length = r.gen(intFrom(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(r.gen(item));
    }
    return result;
  });
}

type AnyRecord = Record<string, unknown>;
type RecordShape<T extends AnyRecord> = { [K in keyof T]: Arbitrary<T[K]> };

export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return new Arbitrary((r) => {
    const keys = Object.keys(shape) as (keyof T)[];
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = r.gen(shape[key]);
    }
    return result as T;
  });
}
