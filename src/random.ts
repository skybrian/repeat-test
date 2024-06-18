import prand from "pure-rand";
import { NumberPicker, PickRequest } from "./picks.ts";

/**
 * Picks randomly from the requested distribution.
 */
export class RandomPicker implements NumberPicker {
  readonly seed;
  private readonly uniform: (min: number, max: number) => number;

  constructor(opts?: { seed: number }) {
    this.seed = opts?.seed ?? Date.now() ^ (Math.random() * 0x100000000);
    const rng = prand.xoroshiro128plus(this.seed);
    this.uniform = (min, max) =>
      prand.unsafeUniformIntDistribution(min, max, rng);
  }

  pick(req: PickRequest): number {
    return req.bias(this.uniform);
  }
}
