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
 * A request for an arbitrary value of a set.
 *
 * An arbitrary can be thought of as defining a set of values that we can
 * randomly sample from. But alternatively, we can think of it as a parser whose
 * input is a stream of choices and whose output is a value taken from some set.
 *
 * Each arbitrary has a default, which is what you get if the choice stream
 * always returns the minimum value.
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
  constructor(readonly parse: (r: Choices) => T) {}
}

/**
 * A request for a safe integer between min and max (inclusive).
 *
 * The range must have at least one entry; that is, min must be less or equal to
 * max.
 */
export class ChoiceRequest {
  constructor(readonly min: number, readonly max: number) {
    if (!Number.isSafeInteger(min)) {
      throw new Error(`min must be a safe integer, got ${min}`);
    }
    if (!Number.isSafeInteger(max)) {
      throw new Error(`max must be a safe integer, got ${max}`);
    }
    if (min > max) {
      throw new Error(`min must be <= max, got ${min} > ${max}`);
    }
  }
}
