import { alwaysPickDefault, IntPicker, PickRequest } from "./picks.ts";

import {
  FakePlayoutLogger,
  PlayoutFailed,
  PlayoutLogger,
  StrictPicker,
} from "./playouts.ts";
import { generateAllSolutions, Solution } from "./solver.ts";

export type PickFunctionOptions<T> = {
  /**
   * Filters out values that don't pass the given filter.
   *
   * @param accept a function that returns true if the picked value
   * should be accepted.
   *
   * It should always return true for an arbitrary's default value.
   */
  accept?: (val: T) => boolean;
};

/**
 * Picks a value given either a PickRequest or an Arbitrary.
 *
 * Throws {@link PlayoutFailed} if it couldn't find a value.
 */
export interface PickFunction {
  (req: PickRequest): number;
  <T>(req: Arbitrary<T>, opts?: PickFunctionOptions<T>): T;
}

/**
 * A function that generates a member of an Arbitrary, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link PlayoutFailed} to indicate that a sequence of picks didn't
 * lead to a value.
 */
export type ArbitraryCallback<T> = (pick: PickFunction) => T;

export type ArbitraryOptions<T> = {
  /**
   * Picks that parse to the default value of this arbitrary.
   *
   * If not set, {@link alwaysPickDefault} will be used.
   */
  defaultPicks?: number[];
};

export type PickMethodOptions<T> = {
  /**
   * How many times to retry filters. Set to 1 to disable backtracking.
   */
  maxTries?: number;

  log?: PlayoutLogger;
};

/**
 * A set of values that can be randomly picked from. Members are generated as
 * needed.
 */
export default class Arbitrary<T> {
  readonly callback: ArbitraryCallback<T>;
  readonly defaultPicks: number[] | undefined;

  /**
   * Creates an arbitrary from a {@link PickRequest} or {@link ArbitraryCallback}.
   */
  static from<T>(
    callback: ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T>;
  static from(req: PickRequest): Arbitrary<number>;
  static from<T>(
    arg: ArbitraryCallback<T> | PickRequest,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (arg instanceof PickRequest) {
      const callback: ArbitraryCallback<number> = (pick) => {
        return pick(arg);
      };
      return new Arbitrary(callback, opts);
    }
    return new Arbitrary(arg, opts);
  }

  private constructor(
    callback: ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T>,
  ) {
    this.callback = callback;
    this.defaultPicks = opts?.defaultPicks ? [...opts.defaultPicks] : undefined;
    this.default; // dry run
  }

  /**
   * Picks an arbitrary member, based on some picks.
   * @throws {@link PickFailed} when it calls `pick()` internally and it fails.
   */
  pick(input: IntPicker, opts?: PickMethodOptions<T>): T {
    const maxTries = opts?.maxTries ?? 1000;
    if (maxTries < 1 || !Number.isSafeInteger(maxTries)) {
      throw new Error("maxTries must be a positive integer");
    }

    const log = opts?.log ?? new FakePlayoutLogger();

    const callbackInput: PickFunction = <T>(
      req: PickRequest | Arbitrary<T>,
      opts?: PickFunctionOptions<T>,
    ): number | T => {
      if (req instanceof PickRequest) {
        return input.pick(req);
      }
      const accept = opts?.accept;

      // non-backtracking case
      if (accept === undefined) {
        const level = log.startSpan();
        const val = req.callback(callbackInput);
        log.endSpan(level);
        return val;
      }

      // retry when there's a filter
      for (let tries = 0; tries < maxTries; tries++) {
        const level = log.startSpan();
        const val = req.callback(callbackInput);
        if (accept === undefined || accept(val)) {
          log.endSpan(level);
          return val;
        }
        if (tries < maxTries - 1) {
          // Cancel only when we're not out of tries.
          log.cancelSpan();
        }
      }

      // Give up. This is normal when backtracking is turned off.
      // Don't cancel so that the picks used in the failed run are available
      // to the caller.
      throw new PlayoutFailed(
        `Failed to generate ${req} after ${maxTries} tries`,
      );
    };

    const val = this.callback(callbackInput);
    log.finished();
    return val;
  }

  /**
   * Attempts to pick a value based on a prerecorded list of picks.
   *
   * Throws {@link PlayoutFailed} if any internal filters didn't accept a pick.
   * (There is no backtracking.)
   *
   * This function can be used to test which picks the Arbitrary accepts as
   * input.
   */
  parse(picks: number[]): T {
    const input = new StrictPicker(picks);

    const val = this.pick(input, { maxTries: 1 });
    if (!input.finished) {
      throw new PlayoutFailed(
        `Picks ${input.offset} to ${picks.length} were unused`,
      );
    }
    return val;
  }

  /** The default value of this Arbitrary. */
  get default(): T {
    // make a clone, in case it's mutable
    const picker = this.defaultPicks
      ? new StrictPicker(this.defaultPicks)
      : alwaysPickDefault;
    return this.pick(picker, { maxTries: 1 });
  }

  /**
   * Iterates over all solutions that can be generated by this Arbitrary.
   *
   * Uses a depth-first search, starting from the default value.
   */
  get solutions(): IterableIterator<Solution<T>> {
    return generateAllSolutions((picker, log): T => {
      return this.pick(picker, { maxTries: 1, log });
    });
  }

  /**
   * Iterates over all values that can be generated by this Arbitrary.
   *
   * Uses a depth-first search, starting from the default value.
   */
  get members(): IterableIterator<T> {
    function* membersOf(arb: Arbitrary<T>): IterableIterator<T> {
      for (const s of arb.solutions) {
        yield s.val;
      }
    }
    return membersOf(this);
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
   * Creates a new Arbitrary by filtering out some members.
   *
   * @param accept a function that returns true if the value should be kept. It
   * must allow at least one value through.
   *
   * @param opts.maxTries how many times to try to pass the filter.
   *
   * @throws if no solution can be found that passes the filter.
   */
  filter(
    accept: (val: T) => boolean,
    opts?: { maxTries: number },
  ): Arbitrary<T> {
    const maxTries = opts?.maxTries ?? 10;

    const solve = (): number[] | undefined => {
      let tries = 0;
      for (const sol of this.solutions) {
        if (accept(sol.val)) {
          return sol.picks;
        }
        tries++;
        if (tries >= maxTries) {
          throw new Error(
            `couldn't find a solution for this filter in ${maxTries} tries`,
          );
        }
      }
      throw new Error("filter has no solutions");
    };

    let defaultPicks = this.defaultPicks;
    if (!accept(this.default)) {
      defaultPicks = solve();
    }

    return new Arbitrary((pick) => {
      return pick(this, { accept });
    }, { defaultPicks });
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
