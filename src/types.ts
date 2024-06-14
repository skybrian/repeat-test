/**
 * An iterator over a infinite stream of choices.
 *
 * Each choice is represented as a safe integer that's selected from a range specified
 * by a {@link ChoiceRequest}.
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
 * Invariant: min <= max, so the range has at least one value.
 */
export class ChoiceRequest {
  constructor(readonly min: number, readonly max: number) {
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
  }

  get default(): number {
    return this.min;
  }

  toArbitrary(): Arbitrary<number> {
    return new Arbitrary((it) => it.next(this));
  }
}

/**
 * A request for an arbitrary value, taken from a set.
 *
 * An Arbitrary's *output set* is the set of values it can return. Its input
 * is a stream of choices. (See {@link Choices}.) We can think of it as
 * a parser that converts a stream of choices into a value.
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
}
