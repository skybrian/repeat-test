import {
  alwaysChooseDefault,
  ArrayPicker,
  NumberPicker,
  PickRequest,
} from "../picks.ts";

export class Generator implements NumberPicker {
  constructor(
    private readonly picker: NumberPicker,
    readonly maxTries: number,
  ) {
    if (this.maxTries < 1 || !Number.isSafeInteger(maxTries)) {
      throw new Error("maxTries must be a positive integer");
    }
  }

  pick<T>(req: PickRequest): number;
  pick<T>(req: Arbitrary<T>): T;
  pick<T>(req: PickRequest | Arbitrary<T>): number | T {
    if (req instanceof PickRequest) {
      return this.picker.pick(req);
    }
    for (let tries = 0; tries < this.maxTries; tries++) {
      const parsed = req.callback(this);
      if (parsed !== RETRY) {
        return parsed;
      }
    }
    throw new Error(`Failed to generate ${this} after ${this.maxTries} tries`);
  }
}

export function generate<T>(
  arb: Arbitrary<T>,
  picker: NumberPicker,
  maxTries: number,
): T {
  const gen = new Generator(picker, maxTries);
  return gen.pick(arb);
}

export const RETRY = Symbol("retry");

/**
 * A function that attempts to convert a stream of picks into a value.
 *
 * If the parse succeeds, it returns the value. If it fails, it returns
 * {@link RETRY}. The caller should try again with a different (typically
 * randomly generated) picks.
 *
 * This is a way of implementing backtracking. A ParseFunction should return
 * `RETRY` instead of using a loop so that the caller knows not to record any
 * picks that led to a failed parse.
 *
 * The *default value* of a parser is whatever it returns when its input is all
 * default values. Returning `RETRY` as the default value is a programming
 * error.
 */
export type ParseFunction<T> = (input: Generator) => T | typeof RETRY;

function calculateDefault<T>(parse: ParseFunction<T>): T {
  const def = parse(new Generator(alwaysChooseDefault, 1));
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
 * a stream of picks. (See {@link NumberPicker}.) We can think of it as a parser
 * that converts a stream of picks into a value.
 */
export class Arbitrary<T> {
  /**
   * @param callback reads any number of picks from the stream and either
   * returns a value or RETRY. It should be deterministic and always finish.
   */
  constructor(readonly callback: ParseFunction<T>) {
    calculateDefault(callback); // dry run; throws exception if invalid
  }

  /**
   * The default value of an Arbitrary. This is whatever {@link parse} returns
   * when we choose the default for each request.
   */
  get default(): T {
    return calculateDefault(this.callback); // a clone, in case it's mutable
  }

  /**
   * Attempts to parse a prerecorded list of picks. All filters must succeed
   * the first time, or the parse fails. (There is no backtracking.)
   *
   * This can be used to test what an Arbitrary accepts.
   */
  parse(picks: number[]): ParseSuccess<T> | ParseFailure<T> {
    const input = new ArrayPicker(picks);
    const val = generate(this, input, 1);
    if (val === RETRY) {
      return { ok: false, guess: this.default, errorOffset: input.offset };
    } else if (input.failed) {
      return { ok: false, guess: val, errorOffset: input.errorOffset! };
    }
    return { ok: true, value: val };
  }

  /**
   * Post-processes each output of this Arbitrary by converting it to a
   * different value. (The default value is also changed.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    return new Arbitrary((it) => {
      const choice = it.pick(this);
      return convert(choice);
    });
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
      const val = it.pick(this);
      return it.pick(convert(val));
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
export function chosenInt(
  min: number,
  max: number,
  opts?: { default?: number },
): Arbitrary<number> {
  const req = new PickRequest(min, max, opts);
  return new Arbitrary((it) => it.pick(req));
}

/**
 * Returns an integer between min and max, chosen with bias towards special
 * cases.
 */
export function biasedInt(
  min: number,
  max: number,
  opts?: { default?: number },
): Arbitrary<number> {
  if (max - min <= 10) {
    return chosenInt(min, max, opts);
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
        return req.default;
      case 3:
        if (min <= 0 && max >= 0) return 0;
        break;
      case 4:
        if (min <= 1 && max >= 1) return 1;
        break;
      case 5:
        if (min <= -1 && max >= -1) return -1;
    }
    return uniform(min, max);
  }

  const req = new PickRequest(min, max, { ...opts, bias: pickBiased });
  return new Arbitrary((it) => it.pick(req));
}

/**
 * Defines an arbitrary that's based on a callback function that generates a
 * value from a stream of picks.
 *
 * The callback must always succeed, but see {@link Arbitrary.filter} for a way
 * to do backtracking in a subrequest.
 */
export function custom<T>(generate: (it: Generator) => T) {
  return new Arbitrary((it) => generate(it));
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
  return example(alternatives).chain((chosen) => chosen);
}

export function array<T>(
  item: Arbitrary<T>,
  opts?: { min?: number; max?: number },
): Arbitrary<T[]> {
  const minLength = opts?.min ?? 0;
  const maxLength = opts?.max ?? 10;
  return custom((it) => {
    const length = it.pick(biasedInt(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(it.pick(item));
    }
    return result;
  });
}
