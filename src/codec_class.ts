import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Solution } from "./arbitrary_class.ts";
import { onePlayout } from "./backtracking.ts";
import * as arb from "./arbitraries.ts";

export type EncodeCallback<T> = (val: T) => number[] | undefined;

/**
 * A codec converts between values and pick sequences that can be parsed by an Arbitrary.
 */
export default class Codec<T> {
  #domain: Arbitrary<T>;
  #callback: EncodeCallback<T>;

  static int(min: number, max: number): Codec<number> {
    const domain = arb.int(min, max);
    if (min >= 0) {
      return new Codec(domain, (val) => [val]);
    } else if (max <= 0) {
      return new Codec(domain, (val) => [-val]);
    } else {
      return new Codec(domain, (val) => [val < 0 ? 1 : 0, Math.abs(val)]);
    }
  }

  static asciiChar(): Codec<string> {
    const domain = arb.asciiChar();
    return new Codec(domain, (val) => {
      const sol = arb.asciiChar().findSolution((s) => s === val);
      if (!sol) return undefined;
      return sol.playout.picks.replies;
    });
  }

  static char16(): Codec<string> {
    const domain = arb.char16();
    return new Codec(domain, (val) => {
      if (val.length !== 1) return undefined;
      const code = val.codePointAt(0);
      if (code === undefined) return undefined;
      if (code < 128) {
        return Codec.asciiChar().encode(val);
      }
      return [code];
    });
  }

  static string() {
    // Using the max array size here because the implementation uses arrays.
    const domain = arb.anyString({ min: 0, max: 2 ** 32 - 1 });

    const item = Codec.char16();

    return new Codec(domain, (val) => {
      const out: number[] = [];
      for (const c of val) {
        const encoded = item.encode(c);
        if (encoded === undefined) return undefined;
        out.push(1);
        out.push(...encoded);
      }
      out.push(0);
      return out;
    });
  }

  private constructor(
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
