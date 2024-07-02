import {
  alwaysPickDefault,
  DepthFirstPicker,
  PickRequest,
  RetryPicker,
  retryPicker,
} from "./picks.ts";

import {
  Playout,
  PlayoutContext,
  PlayoutFailed,
  StrictPicker,
} from "./playouts.ts";

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
 * Picks a value given a PickRequest, an Arbitrary, or a record shape containing
 * multiple Arbitraries.
 *
 * Throws {@link PlayoutFailed} if it couldn't choose a value.
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
 * It may throw {@link PlayoutFailed} to indicate that no arbitrary could be picked
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
   * Creates an arbitrary from a {@link PickRequest}, {@link ArbitraryCallback}, or {@link RecordShape}.
   */
  static from(req: PickRequest): Arbitrary<number>;
  static from<T>(
    callback: ArbitraryCallback<T>,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T>;
  static from<T extends AnyRecord>(
    reqs: RecordShape<T>,
  ): Arbitrary<T>;
  static from<T>(
    arg: PickRequest | ArbitraryCallback<T> | RecordShape<T>,
    opts?: ArbitraryOptions<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      return new Arbitrary(arg, opts);
    } else if (arg instanceof PickRequest) {
      const callback: ArbitraryCallback<number> = (pick) => {
        return pick(arg);
      };
      return new Arbitrary(callback, { ...opts, maxSize: arg.size });
    } else {
      let maxSize: number | undefined = 1;
      const keys = Object.keys(arg) as (keyof T)[];
      for (const key of keys) {
        const size = arg[key].maxSize;
        if (size === undefined) {
          maxSize = undefined;
          break;
        }
        maxSize *= size;
      }
      return new Arbitrary((pick) => pick(arg) as T, { maxSize });
    }
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
   * Finds a solution by trying playouts one at a time from a source of playouts.
   * Throws {@link PlayoutFailed} when it couldn't find a playout that leads to a value.
   */
  pick(picker: RetryPicker): Solution<T> {
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
          throw new PlayoutFailed(
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
      } else {
        return pickRecord(req);
      }
    };

    const val = this.callback(dispatch);
    return { val, playout: ctx.toPlayout() };
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
    const picker = new StrictPicker(picks);

    const sol = this.pick(picker);
    if (!picker.parsed) {
      if (picker.replaying) {
        throw new PlayoutFailed(
          `Picks ${picker.offset} to ${picks.length} were unused`,
        );
      } else {
        throw new PlayoutFailed(
          `More than ${picks.length} picks were used`,
        );
      }
    }
    return sol.val;
  }

  /** The default value of this Arbitrary. */
  get default(): T {
    // make a clone, in case it's mutable
    const picker = this.defaultPicks
      ? new StrictPicker(this.defaultPicks)
      : retryPicker(alwaysPickDefault, 1);
    return this.pick(picker).val;
  }

  /**
   * Iterates over all solutions that can be generated by this Arbitrary.
   *
   * Uses a depth-first search, starting from the default value.
   */
  get solutions(): IterableIterator<Solution<T>> {
    const picker = new DepthFirstPicker({
      firstChildPicker: alwaysPickDefault,
      maxDepth: 100,
    });
    const pick = this.pick.bind(this);

    function* generate() {
      while (true) {
        try {
          yield pick(picker);
        } catch (e) {
          if (!(e instanceof PlayoutFailed)) {
            throw e;
          }
          // backtracking from dead end, so no value to yield
        }
        if (!picker.backTo(0)) {
          return; // no more solutions
        }
      }
    }

    return generate();
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
