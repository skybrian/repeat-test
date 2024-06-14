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
