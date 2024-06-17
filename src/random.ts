import prand from "pure-rand";
import { ChoiceRequest, Choices } from "./choices.ts";

/**
 * Randomly generates choices, without recording them.
 */
export class RandomChoices implements Choices {
  readonly seed;
  private readonly uniform: (min: number, max: number) => number;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    const rng = prand.xoroshiro128plus(this.seed);
    this.uniform = (min, max) =>
      prand.unsafeUniformIntDistribution(min, max, rng);
  }

  next(req: ChoiceRequest): number {
    if (req.bias) return req.bias(this.uniform);
    return this.uniform(req.min, req.max);
  }
}
