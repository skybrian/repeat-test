import { assertEquals } from "@std/assert";

import { Failure, failure, Success, success } from "./results.ts";
import { PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { PickFunction, PickSet } from "./pick_function.ts";
import Arbitrary from "./arbitrary_class.ts";
import { generate, Generated } from "./generated_class.ts";

export type SendErr = (msg: string, opts?: { at: string | number }) => void;

export type PickifyCallback = (
  val: unknown,
  sendErr: SendErr,
) => number[] | undefined;

/**
 * A domain can both validate and generate a set of values.
 */
export default class Domain<T> implements PickSet<T> {
  #arb: Arbitrary<T>;
  #callback: PickifyCallback;

  constructor(
    arb: Arbitrary<T>,
    callback: PickifyCallback,
  ) {
    this.#arb = arb;
    this.#callback = callback;

    // Verify that we can round-trip the default value.

    const def = arb.default();

    const picks = this.pickify(
      def.val,
      "callback returned undefined",
    );
    if (!picks.ok) {
      throw new Error(
        `can't pickify default of ${arb.label}: ${picks.message}`,
      );
    }
    assertEquals(
      def.replies(),
      picks.val,
      `callback's picks don't match for the default value of ${arb.label}`,
    );
  }

  /** The Arbitrary that generates values for this domain. */
  get arb(): Arbitrary<T> {
    return this.#arb;
  }

  get label(): string {
    return this.#arb.label;
  }

  generatePick = (pick: PickFunction): T => {
    return this.#arb.generatePick(pick);
  };

  /**
   * Validates a value, returning a copy created by regenerating it.
   *
   * @throws an Error if the value is not a member of this domain.
   */
  parse(val: unknown): T {
    const gen = this.regenerate(val);
    if (!gen.ok) {
      throw new Error(gen.message);
    }
    return gen.val;
  }

  /**
   * Returns a new domain with only the values accepted by a predicate.
   */
  filter(accept: (val: T) => boolean): Domain<T> {
    return new Domain<T>(this.arb.filter(accept), (val, sendErr) => {
      const gen = this.regenerate(val);
      if (!gen.ok) {
        sendErr(gen.message);
        return undefined;
      }
      if (!accept(gen.val)) {
        sendErr("filter rejected value");
        return undefined;
      }
      return gen.replies();
    });
  }

  /**
   * Validates a value, returning the regenerated value and its picks.
   */
  regenerate(val: unknown): Generated<T> | Failure {
    const picks = this.pickify(val);
    if (!picks.ok) {
      return picks;
    }
    return this.generate(picks.val);
  }

  /**
   * Given some picks, attempts to generate the corresponding value.
   */
  generate(picks: number[]): Generated<T> | Failure {
    const picker = new PlaybackPicker(picks);
    const gen = generate(this.#arb, onePlayout(picker));
    if (picker.error) {
      let msg = picker.error;
      if (gen === undefined) {
        msg = `picks not accepted; ${picker.error}`;
      }
      return failure(msg);
    } else if (gen === undefined) {
      return failure(`picks not accepted by ${this.#arb.label}`);
    }
    return gen;
  }

  pickify(
    val: unknown,
    defaultMessage?: string,
  ): Success<number[]> | Failure {
    let firstError: string | undefined = undefined;
    const sendErr: SendErr = (msg, opts) => {
      if (firstError === undefined) {
        const at = opts?.at;
        firstError = at !== undefined ? `${at}: ${msg}` : msg;
      }
    };
    const picks = this.#callback(val, sendErr);
    if (picks === undefined) {
      const err = firstError ?? defaultMessage ?? "not in domain";
      return failure(err);
    }
    return success(picks);
  }

  /**
   * Returns the picks that encode a value, or undefined if the value isn't a
   * member of the domain.
   *
   * If undefined is returned, errors might be reported by calling
   * {@link sendErr}.
   *
   * If a location is supplied, it will be prepended to inner locations.
   */
  innerPickify(
    val: unknown,
    sendErr: SendErr,
    location?: number | string,
  ): number[] | undefined {
    let innerErr: SendErr = sendErr;
    if (location !== undefined) {
      innerErr = (msg, opts) => {
        const innerAt = opts?.at;
        const at = innerAt ? `${location}.${innerAt}` : "" + location;
        sendErr(msg, { at });
      };
    }
    return this.#callback(val, innerErr);
  }

  asFunction() {
    return () => this;
  }
}
