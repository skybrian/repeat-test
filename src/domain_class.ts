import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Generated, PickSet } from "./arbitrary_class.ts";
import { onePlayout, playback } from "./backtracking.ts";
import { Failure, failure, Success, success } from "./results.ts";
import { assertEquals } from "@std/assert";

export type SendErr = (msg: string, opts?: { at: string }) => void;

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

    const picks = this.maybePickify(
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

  /**
   * Validates a value, returning a copy created by regenerating it.
   *
   * @throws an Error if the value is not a member of this domain.
   */
  parse(val: unknown): T {
    const picks = this.maybePickify(val, "can't parse value");
    if (!picks.ok) {
      throw new Error(picks.message);
    }
    return this.parsePicks(picks.val).val;
  }

  private maybePickify(
    val: unknown,
    defaultMessage: string,
  ): Success<number[]> | Failure {
    let firstError: string | undefined = undefined;
    const sendErr = (msg: string, opts?: { at: string }) => {
      if (firstError === undefined) {
        const at = opts?.at;
        firstError = at ? `${at}: ${msg}` : msg;
      }
    };
    const picks = this.#callback(val, sendErr);
    if (picks === undefined) {
      const err = firstError ?? defaultMessage;
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

  /**
   * Given some picks, returns the corresponding value.
   * @throws an Error if the picks don't encode a member of this domain.
   */
  parsePicks(picks: number[]): Generated<T> {
    const picker = new PlaybackPicker(picks);
    const gen = this.#arb.generate(onePlayout(picker));
    if (picker.error) {
      if (gen === undefined) {
        throw new Error(
          `picks not accepted; ${picker.error}`,
        );
      }
      throw new Error(picker.error);
    }
    if (gen === undefined) {
      throw new Error(`picks not accepted by ${this.#arb.label}`);
    }
    return gen;
  }

  /** Makes a copy of a value by converting it to picks and back again. */
  regenerate(val: unknown): Generated<T> | undefined {
    const picks = this.maybePickify(val, "can't pickify value");
    if (!picks.ok) return undefined;
    return this.arb.generate(playback(picks.val));
  }

  filter(accept: (val: T) => boolean): Domain<T> {
    return new Domain<T>(this.arb.filter(accept), (val, sendErr) => {
      const picks = this.#callback(val, sendErr);
      if (picks === undefined) return undefined;

      // Filter using a copy so that we know it's the right type.
      const gen = this.parsePicks(picks);
      if (!accept(gen.val)) {
        sendErr("filter rejected value");
        return undefined;
      }

      return picks;
    });
  }

  asFunction() {
    return () => this;
  }
}
