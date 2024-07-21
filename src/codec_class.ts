import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { END_OF_PLAYOUTS, Solution } from "./arbitrary_class.ts";
import { onePlayout } from "./backtracking.ts";

export type EncodeCallback = (val: unknown) => number[] | undefined;

/**
 * A codec converts between values and pick sequences that can be parsed by an Arbitrary.
 */
export default class Codec<T> {
  #domain: Arbitrary<T>;
  #callback: EncodeCallback;

  constructor(
    domain: Arbitrary<T>,
    callback: EncodeCallback,
  ) {
    this.#domain = domain;
    this.#callback = callback;

    // Verify that we can round-trip the default value.
    const def = domain.default;
    const picks = this.#callback(def);
    if (picks === undefined) {
      throw new Error("callback can't parse the domain's default value");
    }
    const sol = this.#domain.pickSolution(
      onePlayout(new PlaybackPicker(picks)),
    );
    if (sol === undefined) {
      throw new Error("domain didn't accept the picks for the default value");
    } else if (!sol.playout.picks.isMinPlayout()) {
      throw new Error(
        "callback didn't return a minimum playout for the domain's default value",
      );
    }
  }

  /**
   * The Arbitrary that defines the set of possible values that can be encoded.
   */
  get domain() {
    return this.#domain;
  }

  maybeEncode(val: unknown): number[] | undefined {
    return this.#callback(val);
  }

  inDomain(val: unknown): val is T {
    return this.#callback(val) !== undefined;
  }

  /** Returns the picks that encode the given value. */
  pickify(val: T): number[] {
    const result = this.#callback(val);
    if (result === undefined) throw new Error("Invalid value");
    return result;
  }

  /** Given some picks, returns the value that they encode. */
  parse(picks: number[]): T {
    const picker = new PlaybackPicker(picks);
    const val = this.domain.pick(onePlayout(picker));
    if (picker.error) {
      throw new Error(picker.error);
    }
    if (val === END_OF_PLAYOUTS) {
      throw new Error("picks not accepted");
    }
    return val;
  }

  toSolution(val: T): Solution<T> | undefined {
    const picks = this.maybeEncode(val);
    if (picks === undefined) return undefined;
    return this.#domain.pickSolution(onePlayout(new PlaybackPicker(picks)));
  }

  asFunction() {
    return () => this;
  }
}
