import prand from "pure-rand";
import { Arbitrary, ChoiceRequest, Choices } from "./types.ts";

/**
 * Choices that are generated using a random number generator.
 */
export class RandomChoices implements Choices {
  readonly seed;
  private readonly rng: prand.RandomGenerator;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.rng = prand.xoroshiro128plus(this.seed);
  }

  next(req: ChoiceRequest): number {
    return prand.unsafeUniformIntDistribution(req.min, req.max, this.rng);
  }

  gen<T>(req: Arbitrary<T>): T {
    return req.parse(this);
  }

  samples<T>(req: Arbitrary<T>, count: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.gen(req));
    }
    return result;
  }
}

/**
 * Calls a given function repeatedly with randomly generated values.
 */
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

export function unbiasedInt(min: number, max: number): Arbitrary<number> {
  return new ChoiceRequest(min, max);
}

/**
 * Returns an integer between min and max.
 * For large ranges, the choice will be biased towards special cases.
 */
export function biasedInt(min: number, max: number): Arbitrary<number> {
  const size = max - min + 1;
  if (size <= 10) {
    return new Arbitrary((r) => r.gen(unbiasedInt(min, max)));
  }
  return new Arbitrary((r) => {
    switch (r.gen(unbiasedInt(1, 20))) {
      case 1:
        return min;
      case 2:
        return max;
      case 3:
        if (min <= 0 && max >= 0) return 0;
    }
    return r.gen(unbiasedInt(min, max));
  });
}

export const safeInt = biasedInt(
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
  return new Arbitrary((r) => values[r.gen(biasedInt(0, values.length - 1))]);
}

export function oneOf<T>(reqs: Arbitrary<T>[]): Arbitrary<T> {
  if (reqs.length === 0) {
    throw new Error("Can't choose an item from an empty array");
  }
  if (reqs.length === 1) {
    return reqs[0];
  }
  return new Arbitrary((r) => {
    const choice = r.gen(example(reqs));
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
    const length = r.gen(biasedInt(minLength, maxLength));
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
