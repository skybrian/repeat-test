import { AnyRecord } from "./types.ts";
import { PickList, PickRequest, PlaybackPicker } from "./picks.ts";
import {
  minPlayout,
  onePlayoutPicker,
  PlayoutPicker,
  Pruned,
  rotatePicks,
} from "./backtracking.ts";
import { nestedPicks, SpanList, SpanLog } from "./spans.ts";
import { breadthFirstSearch } from "./search_tree.ts";

export type PickFunctionOptions<T> = {
  /**
   * Filters out values that don't pass the given filter.
   *
   * Returns true if the picked value should be accepted.
   *
   * It should always return true for an arbitrary's default value.
   */
  accept?: (val: T) => boolean;

  /**
   * A filter for the picks that were used to generate an Arbitrary.
   */
  acceptPicks?: (picks: PickList) => boolean;

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
 * A function that generates an value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link Pruned} to indicate that generation failed for
 * sequence of picks it got from the pick function. (For example, it was
 * filtered out.)
 */
export type ArbitraryCallback<T> = (pick: PickFunction) => T;

/**
 * Picks a value given a PickRequest, an Arbitrary, or a record shape containing
 * multiple Arbitraries.
 *
 * Throws {@link Pruned} if the value couldn't be generated.
 */
export interface PickFunction {
  (req: PickRequest): number;
  <T>(req: Arbitrary<T>, opts?: PickFunctionOptions<T>): T;
  <T>(req: ArbitraryCallback<T>): T;
  <T extends AnyRecord>(reqs: RecordShape<T>, opts?: PickFunctionOptions<T>): T;
}

export type ArbitraryOpts = {
  /**
   * An arbitrary label that can be used to identify an arbitrary when debugging.
   * If not provided, a default label will be used.
   */
  label?: string;
};

/**
 * Holds a generated value along with the picks that were used to generate it.
 */
export class Generated<T> {
  #picks: PickList;
  #spans: SpanList;
  #val: T;

  constructor(
    picks: PickList,
    spans: SpanList,
    val: T,
  ) {
    this.#picks = picks;
    this.#spans = spans;
    this.#val = val;
  }

  get ok(): true {
    return true;
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

/**
 * A set of values that can be generated on demand.
 *
 * Every Arbitrary contains a {@link default} value. Some Arbitraries define
 * {@link maxSize}, providing an upper bound on how many values they contain.
 * Others contain an infinite number of values.
 *
 * The values can be iterated over using {@link generateAll}.
 */
export default class Arbitrary<T> {
  readonly #label: string;
  readonly #callback: ArbitraryCallback<T>;

  readonly #examples: T[] | undefined;
  readonly #maxSize: number | undefined;

  private constructor(
    label: string,
    callback: ArbitraryCallback<T>,
    opts?: {
      examples?: T[];
      maxSize?: number;
    },
  ) {
    this.#label = label;
    this.#callback = callback;
    this.#examples = opts?.examples;
    this.#maxSize = opts?.maxSize;
    this.default(); // dry run
  }

  /** A label indicating what kind of Arbitrary this is, for debugging. */
  get label(): string {
    return this.#label;
  }

  /**
   * An upper bound on the number of values that this Arbitrary can generate
   * using {@link generateAll}. (Only available for some small sets.)
   */
  get maxSize(): number | undefined {
    return this.#maxSize;
  }

  /**
   * Generates a value by trying each playout one at a time, given a source of
   * playouts.
   *
   * Returns undefined if it ran out of playouts without generating anything.
   */
  generate(pickers: Iterable<PlayoutPicker>): Generated<T> | undefined {
    for (const picker of pickers) {
      if (!picker.startAt(0)) {
        throw new Error("startAt failed");
      }
      const log = new SpanLog(picker);

      try {
        const pick = Arbitrary.makePickFunction(log, picker);
        const val = this.#callback(pick);
        const picks = picker.getPicks();
        if (picker.finishPlayout()) {
          return new Generated(picks, log.getSpans(), val);
        }
      } catch (e) {
        if (!(e instanceof Pruned)) {
          throw e;
        }
      }
    }
    return undefined;
  }

  private innerPick(
    log: SpanLog,
    pick: PickFunction,
  ): T {
    const level = log.startSpan();
    const val = this.#callback(pick);
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
      const val = this.#callback(pick);
      if (accept(val)) {
        log.endSpan(level);
        return val;
      }
      if (!log.cancelSpan(level)) {
        throw new Pruned("filter");
      }
    }
  }

  /** The default value of this Arbitrary. */
  default(): T {
    if (this.#examples) {
      // assume it's immutable
      return this.#examples[0];
    }
    // make a clone, in case it's mutable
    const gen = this.generate(minPlayout());
    if (gen === undefined) {
      throw new Error(
        "couldn't generate a default value because default picks weren't accepted",
      );
    }
    return gen.val;
  }

  /**
   * Iterates over all values that can be generated by this Arbitrary.
   *
   * This might be an infinite stream if the Arbitrary represents an infinite
   * set. The values start with the default value (for a minimum playout) and
   * gradually get larger, as generated by playouts of increasing size.
   */
  generateAll(): IterableIterator<Generated<T>> {
    function* listGenerator(
      items: T[],
    ): IterableIterator<Generated<T>> {
      const req = new PickRequest(0, listGenerator.length - 1);
      const spans = { starts: [], ends: [] };
      for (let i = 0; i < items.length; i++) {
        const val = items[i];
        const picks = new PickList([req], [i]);
        yield new Generated(picks, spans, val);
      }
    }

    function* callbackGenerator(
      arb: Arbitrary<T>,
    ): IterableIterator<Generated<T>> {
      const it = breadthFirstSearch()[Symbol.iterator]();
      // `generate` will exit early, as soon as it generates a value.
      // Resume the same iteration after each value is generated.
      const resumable: IterableIterator<PlayoutPicker> = {
        [Symbol.iterator]: () => resumable,
        next: function (): IteratorResult<PlayoutPicker> {
          return it.next();
        },
      };
      let val = arb.generate(resumable);
      while (val) {
        yield val;
        val = arb.generate(resumable);
      }
    }

    if (this.#examples) {
      return listGenerator(this.#examples);
    } else {
      return callbackGenerator(this);
    }
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
   * Returns up to n examples from this Arbitrary, in the same order as
   * {@link generateAll}. The first one will be the default value.
   */
  take(n: number): T[] {
    const result = [];
    for (const gen of this.generateAll()) {
      result.push(gen.val);
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
  takeAll(opts?: { limit?: number }): T[] {
    const limit = opts?.limit ?? 1000;

    const examples = this.take(limit + 1);
    if ((examples.length > limit)) {
      throw new Error(`wanted at most ${limit} examples, got more`);
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
  precompute(opts?: { limit?: number; label?: string }): Arbitrary<T> {
    return Arbitrary.from(this.takeAll(opts), opts);
  }

  /**
   * Creates a new Arbitrary by mapping each example to a new value. (The
   * examples are in the same order as in the original.)
   */
  map<U>(convert: (val: T) => U, opts?: ArbitraryOpts): Arbitrary<U> {
    const label = opts?.label ?? "map";
    const callback: ArbitraryCallback<U> = (pick) => {
      const output = pick(this);
      return convert(output);
    };
    const maxSize = this.maxSize;
    return new Arbitrary(label, callback, { maxSize });
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
    opts?: { maxTries?: number; label?: string },
  ): Arbitrary<T> {
    const maxTries = opts?.maxTries ?? 1000;
    const pickOpts: PickFunctionOptions<T> = { accept };

    if (!accept(this.default())) {
      // Override the default picks when picking from the unfiltered Arbitrary
      // so that the default will pass the filter.
      const gen = this.findGenerated(accept, { limit: maxTries });
      if (gen === undefined) {
        throw new Error("filter didn't accept any values");
      }
      pickOpts.defaultPlayout = gen.replies();
    }

    const label = opts?.label ?? "filter";
    const callback: ArbitraryCallback<T> = (pick) => {
      return pick(this, pickOpts);
    };
    const maxSize = this.maxSize;
    return new Arbitrary(label, callback, { maxSize });
  }

  /**
   * Creates a new Arbitrary that maps each example to another Arbitrary and
   * then picks from it.
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
    opts?: ArbitraryOpts,
  ): Arbitrary<U> {
    const label = opts?.label ?? "chain";
    const callback: ArbitraryCallback<U> = (pick) => {
      const output = pick(this);
      const next = convert(output);
      return pick(next);
    };
    return new Arbitrary(label, callback);
  }

  asFunction() {
    return () => this;
  }

  toString() {
    return `Arbitrary(${this.label})`;
  }

  /**
   * Creates an Arbitrary from an {@link ArbitraryCallback}, an array of
   * examples, or a {@link PickRequest}.
   */
  static from(req: PickRequest, opts?: { label?: string }): Arbitrary<number>;
  static from<T>(
    callback: ArbitraryCallback<T>,
    opts?: { label?: string },
  ): Arbitrary<T>;
  static from<T>(examples: T[], opts?: { label?: string }): Arbitrary<T>;
  static from<T>(
    arg: PickRequest | ArbitraryCallback<T> | T[],
    opts?: { label?: string },
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      const label = opts?.label ?? "callback";
      return new Arbitrary(label, arg);
    } else if (Array.isArray(arg)) {
      if (arg.length === 0) {
        throw new Error("an array of examples must have at least one element");
      } else if (arg.length === 1) {
        const label = opts?.label ?? "constant";
        const constant = arg[0];
        return new Arbitrary(label, () => constant, { maxSize: 1 });
      }

      const req = new PickRequest(0, arg.length - 1);

      const label = opts?.label ?? "array";
      const callback: ArbitraryCallback<T> = (pick) => {
        const i = pick(req);
        return arg[i];
      };
      return new Arbitrary(label, callback, {
        examples: arg,
        maxSize: arg.length,
      });
    } else {
      const label = opts?.label ?? "pick";
      return new Arbitrary(label, (pick) => pick(arg), { maxSize: arg.size });
    }
  }

  /**
   * Creates an Arbitrary for a record with the given shape.
   */
  static record<T extends AnyRecord>(
    shape: RecordShape<T>,
    opts?: ArbitraryOpts,
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
    const label = opts?.label ?? "record";
    return new Arbitrary(label, callback, { maxSize });
  }

  /**
   * Creates an arbitrary that picks one of the given arbitaries and then returns it.
   */
  static oneOf<T>(cases: Arbitrary<T>[], opts?: ArbitraryOpts): Arbitrary<T> {
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
      return cases[i].#callback(pick);
    };
    const label = opts?.label ?? "oneOf";
    return new Arbitrary(label, callback, { maxSize });
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
    }
    return Arbitrary.from(examples, { label: "of" });
  }

  /**
   * Returns the result of running a callback with some picks.
   *
   * (For testing.)
   */
  static runWithPicks<T>(
    picks: number[],
    callback: ArbitraryCallback<T>,
  ): Generated<T> {
    const picker = onePlayoutPicker(new PlaybackPicker(picks));
    const log = new SpanLog(picker);
    const pick = Arbitrary.makePickFunction(log, picker);
    if (!picker.startAt(0)) {
      throw new Error("couldn't start playout");
    }
    const val = callback(pick);
    return new Generated(picker.getPicks(), log.getSpans(), val);
  }

  private static makePickFunction<T>(
    log: SpanLog,
    defaultPicker: PlayoutPicker,
  ): PickFunction {
    const dispatch = <T>(
      req: PickRequest | Arbitrary<T> | ArbitraryCallback<T> | RecordShape<T>,
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
        const pick = picker.maybePick(req);
        if (!pick.ok) throw new Pruned(pick.message);
        return pick.val;
      } else if (req instanceof Arbitrary) {
        const { accept, acceptPicks } = opts ?? {};
        if (accept !== undefined) {
          if (acceptPicks !== undefined) {
            throw new Error("accept and acceptPick cannot be used together");
          }
          return req.innerPickWithFilter(log, pick, accept);
        } else {
          const depthBefore = picker.depth;
          const result = req.innerPick(log, pick);
          if (acceptPicks !== undefined) {
            const picks = picker.getPicks();
            picks.splice(0, depthBefore);
            if (!acceptPicks(picks)) {
              throw new Pruned("picks not accepted");
            }
          }
          return result;
        }
      } else if (typeof req === "function") {
        const level = log.startSpan();
        const val = req(pick);
        log.endSpan(level);
        return val;
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
}
