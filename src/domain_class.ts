import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Generated } from "./arbitrary_class.ts";
import { onePlayout } from "./backtracking.ts";

export type EncodeCallback = (val: unknown) => number[] | undefined;

/**
 * A domain can both validate and generate a set of values.
 */
export default class Domain<T> {
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

  /** The Arbitrary that generates values for this domain. */
  get generator(): Arbitrary<T> {
    return this.#generator;
  }

  /** Returns true if the value is a member of this domain. */
  has(val: unknown): val is T {
    return this.#callback(val) !== undefined;
  }

  /**
   * Returns the picks that encode a value.
   * @throws an Error if the value is not a member of this domain.
   */
  pickify(val: T): number[] {
    const result = this.#callback(val);
    if (result === undefined) throw new Error("Invalid value");
    return result;
  }

  maybePickify(val: unknown): number[] | undefined {
    return this.#callback(val);
  }

  /**
   * Given some picks, returns corresponding value.
   * @throws an Error if the picks don't encode a member of this domain.
   */
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

  /** Makes a copy of a value by converting it to picks and back again. */
  regenerate(val: T): Generated<T> | undefined {
    const picks = this.maybePickify(val);
    if (picks === undefined) return undefined;
    return this.#generator.generate(onePlayout(new PlaybackPicker(picks)));
  }

  asFunction() {
    return () => this;
  }
}
