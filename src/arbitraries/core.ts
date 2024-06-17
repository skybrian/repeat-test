import { alwaysChooseDefault, ChoiceRequest, Choices } from "../choices.ts";

export class ArbitraryInput {
  constructor(
    private readonly choices: Choices,
    readonly maxTries: number,
  ) {
    if (this.maxTries < 1 || !Number.isSafeInteger(maxTries)) {
      throw new Error("maxTries must be a positive integer");
    }
  }

  next(req: ChoiceRequest): number {
    return this.choices.next(req);
  }

  gen<T>(req: Arbitrary<T>): T {
    for (let tries = 0; tries < this.maxTries; tries++) {
      const parsed = req.parse(this);
      if (parsed !== RETRY) {
        return parsed;
      }
    }
    throw new Error(`Failed to generate ${req} after ${this.maxTries} tries`);
  }
}

export const RETRY = Symbol("retry");

/**
 * A parser of choices, used to implement an {@link Arbitrary}.
 *
 * If the parse succeeds, it returns a value. If it fails, it returns
 * {@link RETRY}. The caller should try again with a different (typically
 * randomly generated) input.
 *
 * This is a way of implementing backtracking. A ParseFunction should return
 * `RETRY` instead of using a loop for backtracking so that the caller knows not
 * to keep any choices that led to a failed parse.
 *
 * The *default value* of a parser is whatever it returns when its input is all
 * default values. Since all Arbitraries must have a default, returning `RETRY`
 * in this case is a programming error.
 */
export type ParseFunction<T> = (input: ArbitraryInput) => T | typeof RETRY;

function calculateDefault<T>(parse: ParseFunction<T>): T {
  const def = parse(new ArbitraryInput(alwaysChooseDefault, 1));
  if (def === RETRY) {
    throw new Error("parse function must return a default value");
  }
  return def;
}

/**
 * A request for an arbitrary value, taken from a set.
 *
 * An Arbitrary's *output set* is the set of values it can return. Its input is
 * a stream of choices. (See {@link Choices}.) We can think of it as a parser
 * that converts a stream of choices into a value.
 *
 * Arbitraries can make subrequests by calling r.gen(), recursively making a
 * tree of requests. The leaf nodes will be either ChoiceRequests or Arbitraries
 * that return a constant.
 */
export class Arbitrary<T> {
  /**
   * @param parse a callback that reads any number of choices from the stream
   * and returns a value. It should be deterministic and always finish.
   */
  constructor(readonly parse: ParseFunction<T>) {
    calculateDefault(parse); // dry run; throws exception if invalid
  }

  /**
   * The default value of an Arbitrary. This is whatever {@link parse} returns when
   * we choose the default for each request.
   */
  get default(): T {
    return calculateDefault(this.parse);
  }

  /**
   * Removes values from the output set of this Arbitrary. (It must not filter
   * out the default value.)
   */
  filter(accept: (val: T) => boolean): Arbitrary<T> {
    if (!accept(this.default)) {
      throw new Error(
        "cannot filter out the default value of an Arbitrary",
      );
    }

    return new Arbitrary((it) => {
      const parsed = this.parse(it);
      if (parsed === RETRY) return RETRY;
      return accept(parsed) ? parsed : RETRY;
    });
  }

  toString() {
    return `Arbitrary(default: ${this.default})`;
  }
}

/**
 * Returns an integer between min and max, chosen arbitrarily.
 */
export function chosenInt(min: number, max: number): Arbitrary<number> {
  const req = new ChoiceRequest(min, max);
  return new Arbitrary((it) => it.next(req));
}

/**
 * Returns an integer between min and max, chosen with bias towards special cases.
 */
export function biasedInt(min: number, max: number): Arbitrary<number> {
  const req = new ChoiceRequest(min, max, { biased: true });
  return new Arbitrary((it) => it.next(req));
}

/**
 * Creates a custom arbitrary, given a parse callback.
 * @param parse a deterministic function that takes a Choices iterator and returns a value.
 */
export function custom<T>(parse: (it: ArbitraryInput) => T) {
  return new Arbitrary((it) => parse(it));
}

export function example<T>(values: T[]): Arbitrary<T> {
  if (values.length === 0) {
    throw new Error("Can't choose an example from an empty array");
  }
  if (values.length === 1) {
    return custom(() => values[0]);
  }
  return custom((it) => values[it.gen(biasedInt(0, values.length - 1))]);
}

export const boolean = example([false, true]);

export function oneOf<T>(alternatives: Arbitrary<T>[]): Arbitrary<T> {
  if (alternatives.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (alternatives.length === 1) {
    return alternatives[0];
  }
  return custom((it) => {
    const choice = it.gen(example(alternatives));
    return it.gen(choice);
  });
}
