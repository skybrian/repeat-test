import {
  alwaysChooseDefault,
  alwaysChooseMin,
  ArrayPicker,
  IntPicker,
  PickLog,
  PickRequest,
} from "../picks.ts";

class PickFailed extends Error {
  private constructor(msg: string) {
    super(msg);
  }
  static create(req: Arbitrary<unknown>, tries: number): PickFailed {
    return new PickFailed(`Failed to generate ${req} after ${tries} tries`);
  }
}

/**
 * A function that can pick values from integer ranges or arbitraries.
 *
 * @throws PickFailed if a value couldn't be generated due to running out of
 * retries.
 */
interface PickFunction {
  (req: PickRequest): number;
  <T>(req: Arbitrary<T>): T;
}

/**
 * Creates a PickFunction that can handle backtracking.
 * @param ints a source of integer picks
 * @param maxTries how many times to try to generate a pick from each Arbitrary.
 * (Set it to 1 to disable backtracking.)
 */
export function makePickFunction(
  ints: IntPicker,
  maxTries: number,
): PickFunction {
  if (!ints) throw new Error("no integer source given");
  if (maxTries < 1 || !Number.isSafeInteger(maxTries)) {
    throw new Error("maxTries must be a positive integer");
  }

  const doPick: PickFunction = <T>(
    req: PickRequest | Arbitrary<T>,
  ): number | T => {
    if (req instanceof PickRequest) {
      return ints.pick(req);
    }
    for (let tries = 0; tries < maxTries; tries++) {
      const val = req.callback(doPick);
      if (val !== RETRY) {
        return val;
      }
    }
    throw PickFailed.create(req, maxTries);
  };

  return doPick;
}

/**
 * Indicates a failed parse while attempting to generate a value for an
 * Arbitrary.
 */
export const RETRY = Symbol("retry");

/**
 * A function that attempts to generate one of the values of an Arbitrary, given
 * some picks.
 *
 * The function may return {@link RETRY} as a way of backtracking if it's given
 * some picks that can't be used. When that happens, the caller should try again
 * with different picks.
 *
 * (This is a better way than a loop to implement backtracking because the
 * caller can forget about the picks that led to a dead end.)
 *
 * The *default value* of a parser is whatever it returns when its input is all
 * default values. Returning `RETRY` as the default value is a programming
 * error.
 */
export type ParseFunction<T> = (pick: PickFunction) => T | typeof RETRY;

function calculateDefault<T>(parse: ParseFunction<T>): T {
  const def = parse(makePickFunction(alwaysChooseDefault, 1));
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
 * A set of values that can be randomly picked from. Members are generated as
 * needed.
 */
export class Arbitrary<T> {
  readonly callback: ParseFunction<T>;

  /**
   * @param callback reads some picks and either returns a value or RETRY. It
   * should be deterministic and always finish.
   */
  constructor(callback: ParseFunction<T>) {
    this.callback = callback;
    calculateDefault(callback); // dry run; throws exception if invalid
  }

  /**
   * The default value of this Arbitrary. It's calculated by calling the
   * {@link callback} with default picks.
   */
  get default(): T {
    return calculateDefault(this.callback); // a clone, in case it's mutable
  }

  /**
   * Iterates over all members of this Arbitrary.
   *
   * The order is depth-first, from all minimum picks to all maximum picks.
   *
   * (Only works for arbitraries that don't do a lot of filtering.)
   */
  get members(): IterableIterator<T> {
    function* runOnePath<T>(arb: Arbitrary<T>, input: IntPicker): Generator<T> {
      const pick = makePickFunction(input, 1);
      try {
        yield pick(arb);
      } catch (e) {
        if (e instanceof PickFailed) {
          // value was filtered out; continue
        } else {
          throw e;
        }
      }
    }

    function* runAllPaths<T>(arb: Arbitrary<T>): Generator<T> {
      const log = new PickLog(alwaysChooseMin);
      let next: IntPicker | null = log.record();
      while (next !== null) {
        yield* runOnePath(arb, next);
        if (log.replaying) {
          throw "didn't read every value";
        }
        next = log.replayNext();
      }
    }

    return runAllPaths(this);
  }

  /**
   * Attempts to pick a value based on a prerecorded list of picks. All filters
   * must succeed the first time, or the parse fails. (There is no
   * backtracking.)
   *
   * This function can be used to test which picks the Arbitrary accepts as
   * input.
   */
  parse(picks: number[]): ParseSuccess<T> | ParseFailure<T> {
    const input = new ArrayPicker(picks);
    const pick = makePickFunction(input, 1);
    const val = pick(this);
    if (val === RETRY) {
      return { ok: false, guess: this.default, errorOffset: input.offset };
    } else if (input.failed) {
      return { ok: false, guess: val, errorOffset: input.errorOffset! };
    }
    return { ok: true, value: val };
  }

  /**
   * Creates a new arbitrary by mapping each member. (The default value is also
   * mapped.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    return new Arbitrary((pick) => {
      const output = pick(this);
      return convert(output);
    });
  }

  /**
   * Creates a new Arbitrary by removing members. (It must not filter out the
   * default value.)
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
   * Creates a new Arbitrary by converting each member to another Arbitrary and
   * then picking from it.
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
  ): Arbitrary<U> {
    return new Arbitrary((pick) => {
      const output = pick(this);
      const next = convert(output);
      return pick(next);
    });
  }

  toString() {
    return `Arbitrary(default: ${this.default})`;
  }
}

// === constructor functions for core arbitraries ===

/**
 * An integer range, to be picked from uniformly.
 *
 * Invariant: min <= pick <= max.
 */
export function chosenInt(
  min: number,
  max: number,
  opts?: { default?: number },
): Arbitrary<number> {
  const req = new PickRequest(min, max, opts);
  return new Arbitrary((pick) => pick(req));
}

/**
 * An integer range, to be picked from with bias towards special cases.
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
  return new Arbitrary((pick) => pick(req));
}

/**
 * Defines an arbitrary that's based on a callback function that generates a
 * value from a stream of picks.
 *
 * The callback must always succeed, but see {@link Arbitrary.filter} for a way
 * to do backtracking in a subrequest.
 */
export function custom<T>(callback: (pick: PickFunction) => T) {
  return new Arbitrary((pick) => callback(pick));
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
  return custom((pick) => {
    const length = pick(biasedInt(minLength, maxLength));
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(pick(item));
    }
    return result;
  });
}
