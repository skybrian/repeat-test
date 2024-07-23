import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Generated } from "./arbitrary_class.ts";
import { onePlayout } from "./backtracking.ts";

export type EncodeCallback = (val: unknown) => number[] | undefined;

/**
 * A codec converts between values and pick sequences that can be parsed by an Arbitrary.
 */
export default class Codec<T> {
  #generator: Arbitrary<T>;
  #callback: EncodeCallback;

  constructor(
    generator: Arbitrary<T>,
    callback: EncodeCallback,
  ) {
    this.#generator = generator;
    this.#callback = callback;

    // Verify that we can round-trip the default value.
    const def = generator.default();
    const picks = this.#callback(def);
    if (picks === undefined) {
      throw new Error("callback can't parse the domain's default value");
    }
    const gen = this.#generator.generate(
      onePlayout(new PlaybackPicker(picks)),
    );
    if (gen === undefined) {
      throw new Error(
        "can't round-trip the generator's default value: calback's picks weren't accepted",
      );
    } else if (!gen.isDefault()) {
      throw new Error("can't round-trip the generator's default value");
    }
  }

  /**
   * An Arbitrary that generates values in this codec's domain.
   */
  get generator() {
    return this.#generator;
  }

  maybeEncode(val: unknown): number[] | undefined {
    return this.#callback(val);
  }

  has(val: unknown): val is T {
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
    const gen = this.generator.generate(onePlayout(picker));
    if (picker.error) {
      throw new Error(picker.error);
    }
    if (gen === undefined) {
      throw new Error("picks not accepted");
    }
    return gen.val;
  }

  regenerate(val: T): Generated<T> | undefined {
    const picks = this.maybeEncode(val);
    if (picks === undefined) return undefined;
    return this.#generator.generate(onePlayout(new PlaybackPicker(picks)));
  }

  asFunction() {
    return () => this;
  }
}
