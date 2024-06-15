/**
 * An iterator over a infinite stream of choices.
 *
 * Each choice is represented as a safe integer that's selected from a range
 * specified by a {@link ChoiceRequest}.
 *
 * This interface is typically implemented using a random number generator, but
 * any scheme may be used.
 */
export interface Choices {
  /** Returns the next choice from the stream. */
  next(req: ChoiceRequest): number;

  /** Generates a value by taking choices from the stream. */
  gen<T>(req: Arbitrary<T>): T;
}

/**
 * A request for a safe integer between min and max (inclusive).
 *
 * Invariant: min <= max, so the range contains at least one value.
 */
export class ChoiceRequest {
  readonly default: number;

  /**
   * Constructs a new request. Min, max, and the default must be safe integers.
   * They must satisfy min <= default <= max. If a default is not specified, it
   * will be the number closest to zero that's between min and max.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: { default?: number },
  ) {
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer; got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer; got ${max}`);
    }
    if (min > max) {
      throw new Error(
        `the range (min, max) must not be empty; got ${min} > ${max}`,
      );
    }
    const chosenDefault = opts?.default;
    if (chosenDefault !== undefined) {
      if (!this.isValid(chosenDefault)) {
        throw new Error(
          `the default must within the range (${min}, ${max}); got ${chosenDefault}`,
        );
      }
      this.default = chosenDefault;
    } else if (min >= 0) {
      this.default = min;
    } else if (max <= 0) {
      this.default = max;
    } else {
      this.default = 0;
    }
  }

  isValid(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }

  toArbitrary(): Arbitrary<number> {
    return new Arbitrary((it) => it.next(this));
  }
}

/**
 * A request for an arbitrary value, taken from a set.
 *
 * An Arbitrary's *output set* is the set of values it can return. Its input is
 * a stream of choices. (See {@link Choices}.) We can think of it as a parser
 * that converts a stream of choices into a value.
 *
 * The default value of an Arbitrary is whatever it returns when we choose the
 * default for each ChoiceRequest it makes.
 *
 * Arbitraries can make subrequests by calling r.gen(), which recursively
 * defines a tree of requests. The leaf nodes will be either ChoiceRequests or
 * arbitraries that return a constant.
 */
export class Arbitrary<T> {
  /**
   * @param parse a callback that reads any number of choices from the stream
   * and returns a value. It should be deterministic and always finish.
   */
  constructor(readonly parse: (it: Choices) => T) {}

  get default(): T {
    const allDefaults: Choices = {
      next: (req) => req.default,
      gen: (arb) => arb.parse(allDefaults),
    };
    return this.parse(allDefaults);
  }
}
