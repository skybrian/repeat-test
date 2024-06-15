import prand from "pure-rand";
import { Arbitrary, ChoiceRequest, Choices } from "./core.ts";

/**
 * Randomly generates choices, without recording them.
 */
export class RandomChoices implements Choices {
  readonly seed;
  private readonly rng: prand.RandomGenerator;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.rng = prand.xoroshiro128plus(this.seed);
  }

  private choose(min: number, max: number): number {
    return prand.unsafeUniformIntDistribution(min, max, this.rng);
  }

  next(req: ChoiceRequest): number {
    if (!req.biased && req.max - req.min >= 9) {
      switch (this.choose(1, 20)) {
        case 1:
          return req.default;
        case 2:
          return req.min;
        case 3:
          return req.max;
      }
    }
    return this.choose(req.min, req.max);
  }

  gen<T>(req: Arbitrary<T>): T {
    return req.parse(this);
  }

  samples<T>(req: Arbitrary<T>, count: number): T[] {
    const result = [];
    for (let i = 1; i < count; i++) {
      result.push(this.gen(req));
    }
    return result;
  }
}

/**
 * Calls a given function repeatedly with randomly generated values.
 */
export default class SimpleRunner {
  readonly seed;
  readonly count;
  private readonly random: RandomChoices;

  constructor(opts?: { seed: number; count: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    this.count = opts?.count ?? 100;
    this.random = new RandomChoices({ seed: this.seed });
  }

  check<T>(examples: Arbitrary<T>, run: (example: T) => void): void {
    const samples = [examples.default].concat(
      this.random.samples(examples, this.count - 1),
    );

    let passed = 0;
    let first: T | null = null;
    for (const example of samples) {
      try {
        run(example);
      } catch (e) {
        if (first !== null) console.log(`example 1:`, example);
        console.error(`Failed! example ${passed + 1}:`, example);
        throw e;
      }
      passed++;
      if (passed === 1) {
        first = example;
      }
    }
  }
}
