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

  readonly biased: boolean;

  /**
   * Constructs a new request. Min, max, and the default must be safe integers.
   * They must satisfy min <= default <= max.
   *
   * @param opts.default Overrides the default value for this request. If not
   * specified, it will be the number closest to zero that's between min and
   * max.
   *
   * @param opts.biased A hint that when choosing randomly, the min, max, and
   * default choices should be picked more often.
   */
  constructor(
    readonly min: number,
    readonly max: number,
    opts?: { default?: number; biased?: boolean },
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

    this.biased = opts?.biased ?? false;
  }

  isValid(n: number): boolean {
    return Number.isSafeInteger(n) && n >= this.min && n <= this.max;
  }

  toArbitrary(): Arbitrary<number> {
    return new Arbitrary((it) => it.next(this));
  }
}

export const RETRY = Symbol("retry");

/**
 * A function implementing a parser that reads any number of choices from its
 * input.
 *
 * It returns {@link Success} if the parse succeeds. Returning {@link RETRY}
 * means the parse failed and the caller should try again with different
 * (typically randomly generated) input. This is a way of implementing
 * backtracking.
 *
 * The *default value* of a parser is whatever it returns when its input is all
 * default values. Returning {@link RETRY} as a default value is a programming
 * error.
 */
export type ParseFunction<T> = (input: Choices) => T | typeof RETRY;

export function mustParse<T>(parse: ParseFunction<T>, input: Choices): T {
  const parsed = parse(input);
  if (parsed === RETRY) {
    throw new Error("parse function returned RETRY unexpectedly");
  }
  return parsed;
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
 * Arbitraries can make subrequests by calling r.gen(), recursively making a
 * tree of requests. The leaf nodes will be either ChoiceRequests or arbitraries
 * that return a constant.
 */
export class Arbitrary<T> {
  /**
   * @param parse a callback that reads any number of choices from the stream
   * and returns a value. It should be deterministic and always finish.
   */
  constructor(readonly parse: ParseFunction<T>) {}

  get default(): T {
    const allDefaults: Choices = {
      next: (req) => req.default,
      gen: (arb) => mustParse(arb.parse, allDefaults),
    };
    return mustParse(this.parse, allDefaults);
  }

  /**
   * Removes values from the output set of this Arbitrary.
   * (It must not filter out the default value.)
   */
  filter(pred: (val: T) => boolean): Arbitrary<T> {
    if (!pred(this.default)) {
      throw new Error(
        "cannot filter out the default value of an Arbitrary",
      );
    }

    return new Arbitrary((it) => {
      const parsed = this.parse(it);
      if (parsed === RETRY) {
        return RETRY;
      }
      return pred(parsed) ? parsed : RETRY;
    });
  }
}
