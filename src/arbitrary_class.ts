import {
  alwaysPickDefault,
  IntPicker,
  onePlayout,
  PickRequest,
  PlaybackPicker,
  RetryPicker,
} from "./picks.ts";

import { Playout, PlayoutContext } from "./playouts.ts";

import { depthFirstSearch } from "./search_tree.ts";

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

export type AnyRecord = Record<string, unknown>;

/**
 * Specifies a record to be generated.
 *
 * Each field will be independently generated from a different Arbitrary.
 */
export type RecordShape<T> = {
  [K in keyof T]: Arbitrary<T[K]>;
};

/**
 * Indicates that picks couldn't be found for generating a value.
 */
export class PickFailed extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * Picks a value given a PickRequest, an Arbitrary, or a record shape containing
 * multiple Arbitraries.
 *
 * Throws {@link PickFailed} if it couldn't choose a value.
 */
export interface PickFunction {
  (req: PickRequest): number;
  <T>(req: Arbitrary<T>, opts?: PickFunctionOptions<T>): T;
  <T extends AnyRecord>(reqs: RecordShape<T>, opts?: PickFunctionOptions<T>): T;
}

/**
 * A function that generates a member of an Arbitrary, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link PickFailed} to indicate that no arbitrary could be picked
 * using the provided pick function.
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

export type Solution<T> = {
  readonly val: T;
  readonly playout: Playout;
};

/**
 * A set of values that can be randomly picked from. Members are generated as
 * needed.
 */
export default class Arbitrary<T> {
  private readonly callback: ArbitraryCallback<T>;

  private readonly defaultPicks: number[] | undefined;

  /**
   * An upper bound on the number of members in this Arbitrary.
   * (Only available for some small sets.)
   */
  readonly maxSize: number | undefined;

  /**
   * Creates an arbitrary from a {@link PickRequest} or {@link ArbitraryCallback}.
   */
  static from(req: PickRequest): Arbitrary<number>;
  static from<T>(
    callback: ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T>;
  static from<T>(
    arg: PickRequest | ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      return new Arbitrary(arg, opts);
    } else {
      const callback: ArbitraryCallback<number> = (pick) => {
        return pick(arg);
      };
      return new Arbitrary(callback, { ...opts, maxSize: arg.size });
    }
  }

  /**
   * Creates an Arbitrary for a record with the given shape.
   */
  static record<T extends AnyRecord>(
    shape: RecordShape<T>,
  ): Arbitrary<T> {
    let maxSize: number | undefined = 1;
    const keys = Object.keys(shape) as (keyof T)[];
    for (const key of keys) {
      const size = shape[key].maxSize;
      if (size === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize *= size;
    }
    return new Arbitrary((pick) => pick(shape) as T, { maxSize });
  }

  /**
   * Creates an arbitrary that picks one of the given arbitaries and then returns it.
   */
  static oneOf<T>(cases: Arbitrary<T>[]): Arbitrary<T> {
    if (cases.length === 0) {
      throw new Error("oneOf must be called with at least one alternative");
    }
    if (cases.length === 1) {
      return cases[0];
    }
    let maxSize: number | undefined = 0;
    for (const c of cases) {
      if (c.maxSize === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize += c.maxSize;
    }

    const req = new PickRequest(0, cases.length - 1);
    const callback: ArbitraryCallback<T> = (pick) => {
      const c = cases[pick(req)];
      return pick(c);
    };
    return new Arbitrary(callback, { maxSize });
  }

  /**
   * Creates an Arbitrary that returns one of the given items. The first one
   * will be the default.
   *
   * The items are returned as-is, without being cloned. If they are mutable,
   * this might result in unexpected side effects.
   *
   * Consider using {@link from} to generate a new instance of mutable objects
   * each time.
   */
  static of<T>(...members: T[]): Arbitrary<T> {
    if (members.length === 0) {
      throw new Error("Arbitrary.of() requires at least one argument");
    } else if (members.length === 1) {
      const constant = members[0];
      return new Arbitrary(() => constant, { maxSize: 1 });
    }
    const req = new PickRequest(0, members.length - 1);
    const callback: ArbitraryCallback<T> = (pick) => {
      return members[pick(req)];
    };
    return new Arbitrary(callback, {
      defaultPicks: [0],
      maxSize: members.length,
    });
  }

  private constructor(
    callback: ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T> & { maxSize?: number },
  ) {
    this.callback = callback;
    this.defaultPicks = opts?.defaultPicks ? [...opts.defaultPicks] : undefined;
    this.maxSize = opts?.maxSize;
    this.default; // dry run
  }

  /**
   * Finds a solution by trying playouts one at a time from a source of
   * playouts.
   *
   * Returns undefined if the picker ran out of playouts.
   *
   * It's the caller's responsibility to call backTo() before trying again.
   */
  pick(pickers: Iterable<RetryPicker>): Solution<T> | undefined {
    for (const picker of pickers) {
      const ctx = new PlayoutContext(picker);

      // These inner functions are mutually recursive and depend on the passed-in
      // picker. They unwind the arbitraries depth-first to get each pick and then
      // build up a value based on it.

      const pickFromArbitrary = <T>(
        req: Arbitrary<T>,
        opts?: PickFunctionOptions<T>,
      ): T => {
        const accept = opts?.accept;

        // non-backtracking case
        if (accept === undefined) {
          const level = ctx.startSpan();
          const val = req.callback(dispatch);
          ctx.endSpan(level);
          return val;
        }

        // retry when there's a filter
        while (true) {
          const level = ctx.startSpan();
          const val = req.callback(dispatch);
          if (accept(val)) {
            ctx.endSpan(level);
            return val;
          }
          if (!ctx.cancelSpan(level)) {
            // return default?
            throw new PickFailed(
              `Couldn't find a playout that generates ${req}`,
            );
          }
        }
      };

      const pickRecord = <T>(req: RecordShape<T>): T => {
        const keys = Object.keys(req) as (keyof T)[];
        if (keys.length === 0) {
          return {} as T;
        }
        const result = {} as Partial<T>;
        for (const key of keys) {
          result[key] = pickFromArbitrary(req[key]);
        }
        return result as T;
      };

      const dispatch: PickFunction = <T>(
        req: PickRequest | Arbitrary<T> | RecordShape<T>,
        opts?: PickFunctionOptions<T>,
      ): number | T => {
        if (req instanceof PickRequest) {
          return picker.pick(req);
        } else if (req instanceof Arbitrary) {
          return pickFromArbitrary(req, opts);
        } else if (typeof req !== "object") {
          throw new Error("pick called with invalid argument");
        } else {
          return pickRecord(req);
        }
      };

      try {
        const val = this.callback(dispatch);
        return { val, playout: ctx.toPlayout() };
      } catch (e) {
        if (!(e instanceof PickFailed)) {
          throw e;
        }
      }
    }
    return undefined;
  }

  /**
   * Attempts to pick a value based on a prerecorded list of picks.
   *
   * Throws {@link PickFailed} if any internal filters didn't accept a pick.
   * (There is no backtracking.)
   *
   * This function can be used to test which picks the Arbitrary accepts as
   * input.
   */
  parse(picks: number[]): T {
    const picker = new PlaybackPicker(picks);
    const sol = this.pick(onePlayout(picker));
    if (picker.error) {
      throw new PickFailed(picker.error);
    }
    if (!sol) {
      throw new PickFailed("playout not accepted");
    }
    return sol.val;
  }

  defaultPicker(): IntPicker {
    return this.defaultPicks
      ? new PlaybackPicker(this.defaultPicks)
      : alwaysPickDefault;
  }

  /** The default value of this Arbitrary. */
  get default(): T {
    // make a clone, in case it's mutable
    const sol = this.pick(onePlayout(this.defaultPicker()));
    if (!sol) {
      throw new Error(
        "couldn't generate a default value because default picks weren't accepted",
      );
    }
    return sol.val;
  }

  /**
   * Iterates over all solutions that can be generated by this Arbitrary.
   *
   * Uses a depth-first search, starting from the default value.
   */
  get solutions(): IterableIterator<Solution<T>> {
    function* allPicks(arb: Arbitrary<T>): IterableIterator<Solution<T>> {
      const pickers = depthFirstSearch();
      let sol = arb.pick(pickers);
      while (sol) {
        yield sol;
        sol = arb.pick(pickers);
      }
    }

    return allPicks(this);
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
    const maxSize = this.maxSize;
    return new Arbitrary((pick) => {
      const output = pick(this);
      return convert(output);
    }, { maxSize });
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
          return sol.playout.picks;
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

    const maxSize = this.maxSize;
    return new Arbitrary((pick) => {
      return pick(this, { accept });
    }, { defaultPicks, maxSize });
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
