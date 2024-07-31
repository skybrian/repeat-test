import { PlaybackPicker } from "./picks.ts";
import Arbitrary, { Generated, PickSet } from "./arbitrary_class.ts";
import { onePlayout, playback } from "./backtracking.ts";
import { Failure, failure, Success, success } from "./results.ts";

export type PickifyCallback = (
  val: unknown,
  sendErr: (msg: string) => void,
) => number[] | undefined;

export interface Mapper<T, U> {
  map: (val: T) => U;
  parse: (val: unknown, sendErr: (msg: string) => void) => T | undefined;
}

/**
 * A domain can both validate and generate a set of values.
 */
export default class Domain<T> extends PickSet<T> {
  #generator: Arbitrary<T>;
  #callback: PickifyCallback;

  constructor(
    generator: Arbitrary<T>,
    callback: PickifyCallback,
  ) {
    super();
    this.#generator = generator;
    this.#callback = callback;

    // Verify that we can round-trip the default value.
    const def = generator.default();

    const picks = this.maybePickify(def);
    if (!picks.ok) {
      const error = picks.message ?? "callback returned undefined";
      throw new Error(`can't pickify domain's default value: ${error}`);
    }

    const gen = this.#generator.generate(playback(picks.val));
    if (gen === undefined) {
      throw new Error("can't regenerate domain's default value");
    } else if (!gen.isDefault()) {
      throw new Error(
        "regenerating domain's default value got a different value",
      );
    }
  }

  /** The Arbitrary that generates values for this domain. */
  get arbitrary(): Arbitrary<T> {
    return this.#generator;
  }

  /** Returns true if the value is a member of this domain. */
  has(val: unknown): val is T {
    const ignoreError = () => {};
    return this.#callback(val, ignoreError) !== undefined;
  }

  /**
   * Validates a value, returning a copy created by regenerating it.
   *
   * @throws an Error if the value is not a member of this domain.
   */
  parse(val: unknown): T {
    const picks = this.pickify(val as T);
    return this.parsePicks(picks);
  }

  /**
   * Returns the picks that encode a value.
   * @throws an Error if the value is not a member of this domain.
   */
  pickify(val: T): number[] {
    const picks = this.maybePickify(val);
    if (!picks.ok) {
      const error = picks.message ?? "can't pickify value";
      throw new Error(error);
    }
    return picks.val;
  }

  maybePickify(val: unknown): Success<number[]> | Failure {
    let firstError: string | undefined = undefined;
    const sendErr = (msg: string) => {
      if (firstError === undefined) {
        firstError = msg;
      }
    };
    const picks = this.#callback(val, sendErr);
    if (picks === undefined) {
      const err = firstError ?? "can't pickify value";
      return failure(err);
    }
    return success(picks);
  }

  /**
   * Given some picks, returns the corresponding value.
   * @throws an Error if the picks don't encode a member of this domain.
   */
  parsePicks(picks: number[]): T {
    const picker = new PlaybackPicker(picks);
    const gen = this.arbitrary.generate(onePlayout(picker));
    if (picker.error) {
      throw new Error(picker.error);
    }
    if (gen === undefined) {
      throw new Error("domain's generator didn't accept picks");
    }
    return gen.val;
  }

  /** Makes a copy of a value by converting it to picks and back again. */
  regenerate(val: unknown): Generated<T> | undefined {
    const picks = this.maybePickify(val);
    if (!picks.ok) return undefined;
    return this.#generator.generate(playback(picks.val));
  }

  map<U>(mapper: Mapper<T, U>): Domain<U> {
    return new Domain<U>(
      this.arbitrary.map((v: T) => mapper.map(v)),
      (val, sendErr) => {
        const parsed = mapper.parse(val, sendErr);
        if (parsed === undefined) return undefined;
        return this.pickify(parsed);
      },
    );
  }

  filter(accept: (val: T) => boolean): Domain<T> {
    return new Domain<T>(this.arbitrary.filter(accept), (val, sendErr) => {
      const picks = this.#callback(val, sendErr);
      if (picks === undefined) return undefined;

      // Filter using a copy so that we know it's the right type.
      if (!accept(this.parsePicks(picks))) {
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
