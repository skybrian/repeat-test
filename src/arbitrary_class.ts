import { PickRequest, PlaybackPicker } from "./picks.ts";

import {
  defaultPlayout,
  onePlayout,
  PlayoutPruned,
  replaceDefaults,
  RetryPicker,
} from "./backtracking.ts";

import { Playout, PlayoutContext } from "./playouts.ts";

import { breadthFirstSearch } from "./search_tree.ts";

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

  /**
   * If set, default picks in requests will be replaced with the given picks for
   * requests that follow the given playout.
   */
  defaultPlayout?: number[];
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
 * Throws {@link PlayoutPruned} if the current playout is cancelled.
 */
export interface PickFunction {
  (req: PickRequest): number;
  <T>(req: Arbitrary<T>, opts?: PickFunctionOptions<T>): T;
  <T extends AnyRecord>(reqs: RecordShape<T>, opts?: PickFunctionOptions<T>): T;
}

/**
 * A function that generates an example, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link PlayoutPruned} to indicate that there's no solution using
 * the current playout. (For example, it was filtered out.)
 */
export type ArbitraryCallback<T> = (pick: PickFunction) => T;

export type Solution<T> = {
  readonly val: T;
  readonly playout: Playout;
};

/**
 * A set of examples that can be generated on demand.
 *
 * Each Arbitrary contains at least one example, its {@link default} value. Some
 * Arbitraries define {@link maxSize}, giving an upper bound. Others contain an
 * infinite number of examples.
 *
 * The examples can be iterated over using {@link examples}.
 */
export default class Arbitrary<T> {
  private readonly callback: ArbitraryCallback<T>;
  readonly #examples: T[] | undefined;

  /**
   * An upper bound on the number of examples in this Arbitrary.
   * (Only available for some small sets.)
   */
  readonly maxSize: number | undefined;

  /**
   * Creates an arbitrary from a {@link PickRequest} or {@link ArbitraryCallback}.
   */
  static from(req: PickRequest): Arbitrary<number>;
  static from<T>(
    callback: ArbitraryCallback<T>,
  ): Arbitrary<T>;
  static from<T>(
    arg: PickRequest | ArbitraryCallback<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      return new Arbitrary(arg);
    } else {
      return new Arbitrary((pick) => pick(arg), { maxSize: arg.size });
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
    const callback = (pick: PickFunction) => {
      return pick(shape) as T;
    };
    return new Arbitrary(callback, { maxSize });
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
      const i = pick(req);
      return cases[i].callback(pick);
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
  static of<T>(...examples: T[]): Arbitrary<T> {
    if (examples.length === 0) {
      throw new Error("Arbitrary.of() requires at least one argument");
    } else if (examples.length === 1) {
      const constant = examples[0];
      return new Arbitrary(() => constant, { maxSize: 1 });
    }

    const req = new PickRequest(0, examples.length - 1);
    const callback: ArbitraryCallback<T> = (pick) => {
      const i = pick(req);
      return examples[i];
    };
    return new Arbitrary(callback, {
      examples,
      maxSize: examples.length,
    });
  }

  private static makePickFunction<T>(
    ctx: PlayoutContext,
    defaultPicker: RetryPicker,
  ): PickFunction {
    const dispatch = <T>(
      req: PickRequest | Arbitrary<T> | RecordShape<T>,
      opts?: PickFunctionOptions<T>,
    ): number | T => {
      let picker = defaultPicker;
      let pick: PickFunction = dispatch;
      const newDefaults = opts?.defaultPlayout;
      if (newDefaults !== undefined) {
        picker = replaceDefaults(picker, newDefaults);
        pick = Arbitrary.makePickFunction(ctx, picker);
      }

      if (req instanceof PickRequest) {
        return picker.maybePick(req);
      } else if (req instanceof Arbitrary) {
        const accept = opts?.accept;
        if (accept !== undefined) {
          return req.nestedPickWithFilter(ctx, pick, accept);
        } else {
          return req.nestedPick(ctx, pick);
        }
      } else if (typeof req !== "object") {
        throw new Error("pick called with invalid argument");
      } else {
        return Arbitrary.pickRecord(req, ctx, pick);
      }
    };
    return dispatch;
  }

  private static pickRecord<T>(
    req: RecordShape<T>,
    ctx: PlayoutContext,
    pick: PickFunction,
  ): T {
    const keys = Object.keys(req) as (keyof T)[];
    if (keys.length === 0) {
      return {} as T;
    }
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = req[key].nestedPick(ctx, pick);
    }
    return result as T;
  }

  private constructor(
    callback: ArbitraryCallback<T>,
    opts?: {
      examples?: T[];
      maxSize?: number;
    },
  ) {
    this.callback = callback;
    this.#examples = opts?.examples;
    this.maxSize = opts?.maxSize;
    this.default; // dry run
  }

  /**
   * Finds a solution by trying each playout one at a time, given a source of
   * playouts.
   *
   * Returns undefined if it ran out of playouts without finding a solution.
   */
  pick(pickers: Iterable<RetryPicker>): Solution<T> | undefined {
    for (const picker of pickers) {
      try {
        const ctx = new PlayoutContext(picker);
        const pick = Arbitrary.makePickFunction(ctx, picker);
        const val = this.callback(pick);
        if (picker.finishPlayout()) {
          return { val, playout: ctx.toPlayout() };
        }
      } catch (e) {
        if (!(e instanceof PlayoutPruned)) {
          throw e;
        }
        // Try again with the next playout.
      }
    }
  }

  private nestedPick(
    ctx: PlayoutContext,
    pick: PickFunction,
  ): T {
    const level = ctx.startSpan();
    const val = this.callback(pick);
    ctx.endSpan(level);
    return val;
  }

  private nestedPickWithFilter(
    ctx: PlayoutContext,
    pick: PickFunction,
    accept: (val: T) => boolean,
  ): T {
    while (true) {
      const level = ctx.startSpan();
      const val = this.callback(pick);
      if (accept(val)) {
        ctx.endSpan(level);
        return val;
      }
      if (!ctx.cancelSpan(level)) {
        // return default?
        throw new PlayoutPruned(
          `Couldn't find a playout that generates ${this}`,
        );
      }
    }
  }

  /**
   * Returns the value corresponding to the given playout.
   *
   * Throws {@link PlayoutPruned} if there is no solution for the given playout.
   *
   * This function can be used to test which picks the Arbitrary accepts as
   * input.
   */
  parse(picks: number[]): T {
    const picker = new PlaybackPicker(picks);
    const sol = this.pick(onePlayout(picker));
    if (picker.error) {
      throw new PlayoutPruned(picker.error);
    }
    if (!sol) {
      throw new PlayoutPruned("playout not accepted");
    }
    return sol.val;
  }

  /** The default value of this Arbitrary. */
  get default(): T {
    return this.defaultSolution.val;
  }

  get defaultSolution(): Solution<T> {
    // make a clone, in case it's mutable
    const sol = this.pick(defaultPlayout());
    if (!sol) {
      throw new Error(
        "couldn't generate a default value because default picks weren't accepted",
      );
    }
    return sol;
  }

  /**
   * Iterates over all solutions that can be generated by this Arbitrary.
   */
  get solutions(): IterableIterator<Solution<T>> {
    function* allPicks(arb: Arbitrary<T>): IterableIterator<Solution<T>> {
      const it = breadthFirstSearch()[Symbol.iterator]();
      // Pick will exit early when it finds a solution.
      // Resume the same iteration after each pick.
      const resumable: IterableIterator<RetryPicker> = {
        [Symbol.iterator]: () => resumable,
        next: function (): IteratorResult<RetryPicker> {
          return it.next();
        },
      };
      let sol = arb.pick(resumable);
      while (sol) {
        yield sol;
        sol = arb.pick(resumable);
      }
    }

    return allPicks(this);
  }

  /**
   * Iterates over all values that can be generated by this Arbitrary.
   */
  examples(): IterableIterator<T> {
    if (this.#examples) {
      return this.#examples.values();
    }
    function* examplesOf(arb: Arbitrary<T>): IterableIterator<T> {
      for (const s of arb.solutions) {
        yield s.val;
      }
    }
    return examplesOf(this);
  }

  /**
   * Returns up to n examples from this Arbitrary.
   */
  take(n: number): T[] {
    const result = [];
    for (const ex of this.examples()) {
      result.push(ex);
      if (result.length >= n) {
        break;
      }
    }
    return result;
  }

  /**
   * Creates a new Arbitrary by mapping each example to a new value. (The
   * examples are in the same order as in the original.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    const maxSize = this.maxSize;
    const callback: ArbitraryCallback<U> = (pick) => {
      const output = pick(this);
      return convert(output);
    };
    return new Arbitrary(callback, { maxSize });
  }

  /**
   * Creates a new Arbitrary by filtering out some examples.
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

    const pickOpts: PickFunctionOptions<T> = { accept };

    if (!accept(this.default)) {
      // Override the default picks when picking from the unfiltered Arbitrary
      // so that the default will pass the filter.
      pickOpts.defaultPlayout = solve();
    }

    const maxSize = this.maxSize;
    const callback: ArbitraryCallback<T> = (pick) => {
      return pick(this, pickOpts);
    };
    return new Arbitrary(callback, { maxSize });
  }

  /**
   * Creates a new Arbitrary that maps each example to another Arbitrary and
   * then picks from it.
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
  ): Arbitrary<U> {
    const callback: ArbitraryCallback<U> = (pick) => {
      const output = pick(this);
      const next = convert(output);
      return pick(next);
    };
    return new Arbitrary(callback);
  }

  asFunction() {
    return () => this;
  }

  toString() {
    return `Arbitrary(default: ${this.default})`;
  }
}
