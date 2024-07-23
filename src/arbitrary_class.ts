import { AnyRecord } from "./types.ts";
import { PickList, PickRequest } from "./picks.ts";

import {
  minPlayout,
  PlayoutPruned,
  RetryPicker,
  rotatePicks,
} from "./backtracking.ts";

import { nestedPicks, SpanList, SpanLog } from "./spans.ts";

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
 * A function that generates an value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link PlayoutPruned} to indicate that generation failed for
 * sequence of picks it got from the pick function. (For example, it was
 * filtered out.)
 */
export type ArbitraryCallback<T> = (pick: PickFunction) => T;

export class Generated<T> {
  #generator: Arbitrary<T>;
  #val: T;
  #picks: PickList;
  #spans: SpanList;

  constructor(
    generator: Arbitrary<T>,
    val: T,
    picks: PickList,
    spans: SpanList,
  ) {
    this.#generator = generator;
    this.#val = val;
    this.#picks = picks;
    this.#spans = spans;
  }

  get generator() {
    return this.#generator;
  }

  get val() {
    return this.#val;
  }

  isDefault() {
    return this.#picks.isMinPlayout();
  }

  picks() {
    return this.#picks.slice();
  }

  replies() {
    return this.#picks.replies();
  }

  nestedPicks() {
    return nestedPicks(this.replies(), this.#spans);
  }
}

export const END_OF_PLAYOUTS = Symbol("END_OF_PLAYOUTS");

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
  readonly #label: string;
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
    opts?: { label?: string },
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      const label = opts?.label ?? "callback";
      return new Arbitrary(arg, { label });
    } else {
      const label = opts?.label ?? `pick ${arg.min} - ${arg.max}`;
      return new Arbitrary((pick) => pick(arg), { label, maxSize: arg.size });
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
    return new Arbitrary(callback, { maxSize, label: "record" });
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
    return new Arbitrary(callback, { maxSize, label: "oneOf" });
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
      return new Arbitrary(() => constant, {
        maxSize: 1,
        label: "of (constant)",
      });
    }

    const req = new PickRequest(0, examples.length - 1);
    const callback: ArbitraryCallback<T> = (pick) => {
      const i = pick(req);
      return examples[i];
    };
    return new Arbitrary(callback, {
      examples,
      maxSize: examples.length,
      label: "of",
    });
  }

  private static makePickFunction<T>(
    log: SpanLog,
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
        picker = rotatePicks(picker, newDefaults);
        pick = Arbitrary.makePickFunction(log, picker);
      }

      if (req instanceof PickRequest) {
        return picker.maybePick(req);
      } else if (req instanceof Arbitrary) {
        const accept = opts?.accept;
        if (accept !== undefined) {
          return req.innerPickWithFilter(log, pick, accept);
        } else {
          return req.innerPick(log, pick);
        }
      } else if (typeof req !== "object") {
        throw new Error("pick called with invalid argument");
      } else {
        return Arbitrary.pickRecord(req, log, pick);
      }
    };
    return dispatch;
  }

  private static pickRecord<T>(
    req: RecordShape<T>,
    log: SpanLog,
    pick: PickFunction,
  ): T {
    const keys = Object.keys(req) as (keyof T)[];
    if (keys.length === 0) {
      return {} as T;
    }
    const result = {} as Partial<T>;
    for (const key of keys) {
      result[key] = req[key].innerPick(log, pick);
    }
    return result as T;
  }

  private constructor(
    callback: ArbitraryCallback<T>,
    opts: {
      label: string;
      examples?: T[];
      maxSize?: number;
    },
  ) {
    this.callback = callback;
    this.#label = opts.label;
    this.#examples = opts.examples;
    this.maxSize = opts.maxSize;
    this.default; // dry run
  }

  get label(): string {
    return this.#label;
  }

  pick(pickers: Iterable<RetryPicker>): T | typeof END_OF_PLAYOUTS {
    for (const picker of pickers) {
      const log = new SpanLog(picker);
      const val = this.pickOnce(log, picker);
      if (val !== END_OF_PLAYOUTS) {
        return val;
      }
    }
    return END_OF_PLAYOUTS;
  }

  /**
   * Generates a value by trying each playout one at a time, given a source of
   * playouts.
   *
   * Returns undefined if it ran out of playouts without generating anything.
   */
  generate(pickers: Iterable<RetryPicker>): Generated<T> | undefined {
    for (const picker of pickers) {
      const log = new SpanLog(picker);
      const val = this.pickOnce(log, picker);
      if (val !== END_OF_PLAYOUTS) {
        return new Generated(this, val, picker.getPicks(), log.getSpans());
      }
    }
    return undefined;
  }

  private pickOnce(
    log: SpanLog,
    picker: RetryPicker,
  ): T | typeof END_OF_PLAYOUTS {
    try {
      const pick = Arbitrary.makePickFunction(log, picker);
      const val = this.callback(pick);
      if (picker.finishPlayout()) {
        return val;
      } else {
        return END_OF_PLAYOUTS;
      }
    } catch (e) {
      if (!(e instanceof PlayoutPruned)) {
        throw e;
      }
      return END_OF_PLAYOUTS;
    }
  }

  private innerPick(
    log: SpanLog,
    pick: PickFunction,
  ): T {
    const level = log.startSpan();
    const val = this.callback(pick);
    log.endSpan(level);
    return val;
  }

  private innerPickWithFilter(
    log: SpanLog,
    pick: PickFunction,
    accept: (val: T) => boolean,
  ): T {
    while (true) {
      const level = log.startSpan();
      const val = this.callback(pick);
      if (accept(val)) {
        log.endSpan(level);
        return val;
      }
      if (!log.cancelSpan(level)) {
        // return default?
        throw new PlayoutPruned(
          `Couldn't find a playout that generates ${this}`,
        );
      }
    }
  }

  /** The default value of this Arbitrary. */
  get default(): T {
    if (this.#examples) {
      // assume it's immutable
      return this.#examples[0];
    }
    // make a clone, in case it's mutable
    const ex = this.pick(minPlayout());
    if (ex === END_OF_PLAYOUTS) {
      throw new Error(
        "couldn't generate a default value because default picks weren't accepted",
      );
    }
    return ex;
  }

  /**
   * Iterates over all values that can be generated by this Arbitrary.
   *
   * This might be an infinite stream if the Arbitrary represents an infinite
   * set. The values start with the default value (for a minimum playout) and
   * gradually get larger, as generated by playouts of increasing size.
   */
  generateAll(): IterableIterator<Generated<T>> {
    function* allPicks(arb: Arbitrary<T>): IterableIterator<Generated<T>> {
      const it = breadthFirstSearch()[Symbol.iterator]();
      // `generate` will exit early, as soon as it generates a value.
      // Resume the same iteration after each value is generated.
      const resumable: IterableIterator<RetryPicker> = {
        [Symbol.iterator]: () => resumable,
        next: function (): IteratorResult<RetryPicker> {
          return it.next();
        },
      };
      let val = arb.generate(resumable);
      while (val) {
        yield val;
        val = arb.generate(resumable);
      }
    }

    return allPicks(this);
  }

  /**
   * Returns the first generated value that satisfies the given predicate, if
   * it's within the given limit.
   *
   * Returns undefined if every possible value was tried.
   */
  findGenerated(
    predicate: (val: T) => boolean,
    opts?: { limit: number },
  ): Generated<T> | undefined {
    const limit = opts?.limit ?? 1000;

    let count = 0;
    for (const gen of this.generateAll()) {
      if (predicate(gen.val)) {
        return gen;
      }
      if (++count >= limit) {
        throw new Error(`No values matched within ${limit} tries`);
      }
    }
    return undefined;
  }

  /**
   * Iterates over all values that can be generated by this Arbitrary.
   */
  examples(): IterableIterator<T> {
    if (this.#examples) {
      return this.#examples.values();
    }
    function* examplesOf(arb: Arbitrary<T>): IterableIterator<T> {
      for (const s of arb.generateAll()) {
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
   * Generates all examples from this Arbitrary, provided that it's not too many.
   *
   * @param opts.limit The maximum size of the array to return.
   */
  takeAll(opts?: { limit: number }): T[] {
    const limit = opts?.limit ?? 1000;

    const examples = this.take(limit + 1);
    if ((examples.length > limit)) {
      throw new Error(
        `Arbitrary.precompute: wanted at most ${limit} examples, got more`,
      );
    }
    return examples;
  }

  /**
   * Creates a new Arbitrary that generates the same examples as this one, but
   * they're picked from an internal list instead of generated each time.
   *
   * The examples won't be cloned, so this method should only be used for
   * immutable values.
   *
   * When picking randomly, a uniform distribution will be used, regardless of
   * what the distribution was originally.
   *
   * @param opts.limit The maximum number of examples allowed.
   */
  precompute(opts?: { limit: number }): Arbitrary<T> {
    return Arbitrary.of(...this.takeAll(opts));
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
    return new Arbitrary(callback, { maxSize, label: "map" });
  }

  /**
   * Creates a new Arbitrary by filtering out values.
   *
   * @param accept a function that returns true if the value should be kept. It
   * must allow at least one value through.
   *
   * @param opts.maxTries how many times to try to pass the filter.
   *
   * @throws if no value can be found that passes the filter.
   */
  filter(
    accept: (val: T) => boolean,
    opts?: { maxTries: number },
  ): Arbitrary<T> {
    const maxTries = opts?.maxTries ?? 1000;
    const pickOpts: PickFunctionOptions<T> = { accept };

    if (!accept(this.default)) {
      // Override the default picks when picking from the unfiltered Arbitrary
      // so that the default will pass the filter.
      const gen = this.findGenerated(accept, { limit: maxTries });
      if (gen === undefined) {
        throw new Error("filter didn't accept any values");
      }
      pickOpts.defaultPlayout = gen.replies();
    }

    const maxSize = this.maxSize;
    const callback: ArbitraryCallback<T> = (pick) => {
      return pick(this, pickOpts);
    };
    return new Arbitrary(callback, { maxSize, label: "filter" });
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
    return new Arbitrary(callback, { label: "chain" });
  }

  asFunction() {
    return () => this;
  }

  toString() {
    return `Arbitrary(${this.label})`;
  }
}
