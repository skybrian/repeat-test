import {
  alwaysChooseDefault,
  ArrayChoices,
  ChoiceRequest,
  Choices,
} from "../choices.ts";

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
    return req.generate(this);
  }
}

export const RETRY = Symbol("retry");

/**
 * A function that attempts to convert a stream of choices into a value.
 *
 * If the parse succeeds, it returns the value. If it fails, it returns
 * {@link RETRY}. The caller should try again with a different (typically
 * randomly generated) input.
 *
 * This is a way of implementing backtracking. A ParseFunction should return
 * `RETRY` instead of using a loop so that the caller knows not to record any
 * choices that led to a failed parse.
 *
 * The *default value* of a parser is whatever it returns when its input is all
 * default values. Returning `RETRY` as the default value is a programming
 * error.
 */
export type ParseFunction<T> = (input: ArbitraryInput) => T | typeof RETRY;

function calculateDefault<T>(parse: ParseFunction<T>): T {
  const def = parse(new ArbitraryInput(alwaysChooseDefault, 1));
  if (def === RETRY) {
    throw new Error("parse function must return a default value");
  }
  return def;
}

export type ParseSuccess<T> = {
  ok: true;
  value: T;
};

export type ParseFailure<T> = {
  ok: false;
  guess: T;
  errorOffset: number;
};

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
   * @param callback reads any number of choices from the stream
   * and returns a value. It should be deterministic and always finish.
   */
  constructor(private readonly callback: ParseFunction<T>) {
    calculateDefault(callback); // dry run; throws exception if invalid
  }

  /**
   * The default value of an Arbitrary. This is whatever {@link parse} returns when
   * we choose the default for each request.
   */
  get default(): T {
    return calculateDefault(this.callback); // a clone, in case it's mutable
  }

  /**
   * Attempts to parse a prerecorded list of choices. All filters must succeed
   * the first time, or the parse fails. (There is no backtracking.)
   *
   * This can be used to test what an Arbitrary accepts.
   */
  parse(choices: number[]): ParseSuccess<T> | ParseFailure<T> {
    const input = new ArrayChoices(choices);
    const val = new ArbitraryInput(input, 1).gen(this);
    if (val === RETRY) {
      return { ok: false, guess: this.default, errorOffset: input.offset };
    } else if (input.failed) {
      return { ok: false, guess: val, errorOffset: input.errorOffset! };
    }
    return { ok: true, value: val };
  }

  /** Attempts to generate a value, backtracking if needed. */
  generate(input: ArbitraryInput): T {
    for (let tries = 0; tries < input.maxTries; tries++) {
      const parsed = this.callback(input);
      if (parsed !== RETRY) {
        return parsed;
      }
    }
    throw new Error(`Failed to generate ${this} after ${input.maxTries} tries`);
  }

  /**
   * Post-processes each output of this Arbitrary by converting it to a
   * different value. (The default value is also changed.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    return new Arbitrary((it) => convert(it.gen(this)));
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
      const parsed = this.callback(it);
      if (parsed === RETRY) return RETRY;
      return accept(parsed) ? parsed : RETRY;
    });
  }

  /**
   * Post-processes each output of this Arbitrary by creating a new Arbitrary
   * and then choosing from it.
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
  ): Arbitrary<U> {
    return new Arbitrary((it) => {
      const val = it.gen(this);
      return it.gen(convert(val));
    });
  }

  toString() {
    return `Arbitrary(default: ${this.default})`;
  }
}

// === constructor functions for core arbitraries ===

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
  if (max - min <= 10) {
    return chosenInt(min, max);
  }
  function pickBiased(
    uniform: (min: number, max: number) => number,
  ): number {
    switch (uniform(0, 15)) {
      case 0:
        return req.min;
      case 1:
        return req.max;
      case 2:
        if (min <= 0 && max >= 0) return 0;
        break;
      case 3:
        if (min <= 1 && max >= 1) return 1;
        break;
      case 4:
        if (min <= -1 && max >= -1) return -1;
    }
    return uniform(min, max);
  }

  const req = new ChoiceRequest(min, max, { bias: pickBiased });
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
  return biasedInt(0, values.length - 1).map((idx) => values[idx]);
}

export const boolean = example([false, true]);

export function oneOf<T>(alternatives: Arbitrary<T>[]): Arbitrary<T> {
  if (alternatives.length === 0) {
    throw new Error("oneOf must be called with at least one alternative");
  }
  if (alternatives.length === 1) {
    return alternatives[0];
  }
  return example(alternatives).chain((choice) => choice);
}
