import prand from "pure-rand";
import { ChoiceRequest, Choices } from "./choices.ts";

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
}
