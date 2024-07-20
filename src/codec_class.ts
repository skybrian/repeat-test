import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Solution } from "./arbitrary_class.ts";
import { onePlayout } from "./backtracking.ts";

export type EncodeCallback<T> = (val: T) => number[] | undefined;

/**
 * A codec converts between values and pick sequences that can be parsed by an Arbitrary.
 */
export default class Codec<T> {
  #domain: Arbitrary<T>;
  #callback: EncodeCallback<T>;

  constructor(
    arb: Arbitrary<T>,
    callback: EncodeCallback<T>,
  ) {
    this.#domain = arb;
    this.#callback = callback;
  }

  /**
   * An Arbitrary defining the set of values that can be encoded.
   */
  get domain() {
    return this.#domain;
  }

  encode(val: T): number[] {
    const result = this.#callback(val);
    if (result === undefined) throw new Error("Invalid value");
    return result;
  }

  decode(picks: number[]): T {
    return this.#domain.parse(picks);
  }

  toSolution(val: T): Solution<T> | undefined {
    const picks = this.#callback(val);
    if (picks === undefined) return undefined;
    return this.#domain.pickSolution(onePlayout(new PlaybackPicker(picks)));
  }
}
