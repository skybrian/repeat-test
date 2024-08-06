import { AnyRecord } from "./types.ts";
import { PickList, PickRequest } from "./picks.ts";
import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { breadthFirstSearch } from "./searches.ts";

/**
 * A set of possible values that may be generated.
 *
 * (Or perhaps a *multiset*, since many PickSets have an
 * {@link Arbitrary#generateAll} method that generates duplicates.)
 */
export interface PickSet<T> {
  /** The arbitrary that will generate the values. */
  get arb(): Arbitrary<T>;
}

export type PickFunctionOpts<T> = {
  /**
   * A callback function that filters values after they're generated.
   *
   * (The second argument is used by the Jar class to filter out duplicates.)
   */
  accept?: (val: T, picks: PickList) => boolean;
};

/**
 * Generates a value given a PickRequest, an Arbitrary, or some other PickSet.
 *
 * Throws {@link Pruned} if no value can be generated, perhaps due to filtering.
 */
export interface PickFunction {
  (req: PickRequest): number;
  <T>(req: PickSet<T>, opts?: PickFunctionOpts<T>): T;
}

export type GenerateOpts = {
  /**
   * A limit on the number of picks to generate normally during a playout. It
   * can be used to limit the size of generated objects.
   *
   * Once the limit is reached, the {@link PickFunction} will always generate
   * the default value for any sub-objects being generated.
   */
  limit?: number;
};

export function makePickFunction<T>(
  picker: PlayoutPicker,
  opts?: GenerateOpts,
): PickFunction {
  const limit = opts?.limit ?? 1000;
  const dispatch = <T>(
    req: PickRequest | PickSet<T>,
    opts?: PickFunctionOpts<T>,
  ): number | T => {
    if (req instanceof PickRequest) {
      if (picker.depth >= limit) {
        req = new PickRequest(req.min, req.min);
      }
      const pick = picker.maybePick(req);
      if (!pick.ok) throw new Pruned(pick.message);
      return pick.val;
    }
    const arb = req["arb"];
    if (arb instanceof Arbitrary) {
      const accept = opts?.accept;
      if (accept === undefined) {
        return arb.innerPick(picker, dispatch);
      }

      // filtered pick
      while (true) {
        const depth = picker.depth;
        const depthBefore = picker.depth;
        const val = arb.innerPick(picker, dispatch);
        const picks = picker.getPicks(depthBefore);
        if (accept(val, picks)) {
          return val;
        }
        if (!picker.startAt(depth)) {
          throw new Pruned("accept() returned false for all possible values");
        }
      }
    }
    throw new Error("pick function called with an invalid argument");
  };
  return dispatch;
}

/**
 * A function that generates a value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link Pruned} to indicate that generation failed for the
 * current pick sequence. (For example, due to filtering.)
 */
export type ArbitraryCallback<T> = (pick: PickFunction) => T;

/**
 * Specifies a record to be generated.
 *
 * Each field will be independently generated.
 */
export type RecordShape<T> = {
  [K in keyof T]: PickSet<T[K]>;
};

export type ArbitraryOpts = {
  /**
   * A short string that can be used to identify an arbitrary in error messages.
   * If not provided, a default label will be used.
   */
  label?: string;
};

/**
 * Holds a generated value along with the picks that were used to generate it.
 */
export class Generated<T> {
  #picks: PickList;
  #val: T;

  constructor(
    picks: PickList,
    val: T,
  ) {
    this.#picks = picks;
    this.#val = val;
  }

  readonly ok = true;

  get val() {
    return this.#val;
  }

  picks() {
    return this.#picks.slice();
  }

  replies() {
    return this.#picks.replies();
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
export default class Arbitrary<T> implements PickSet<T> {
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

  get arb(): Arbitrary<T> {
    return this;
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
  generate(
    picker: PlayoutPicker,
    opts?: GenerateOpts,
  ): Generated<T> | undefined {
    while (picker.startAt(0)) {
      try {
        const pick = makePickFunction(picker, opts);
        const val = this.#callback(pick);
        const picks = picker.getPicks();
        if (picker.endPlayout()) {
          return new Generated(picks, val);
        }
      } catch (e) {
        if (!(e instanceof Pruned)) {
          throw e;
        }
      }
    }
  }

  /**
   * Searches at the current depth for a playout that the Arbitrary accepts.
   *
   * (This is normally called by a PickFunction's implementation.)
   *
   * @param picker a source of playouts, already in 'picking' mode.
   * @param pick the pick function used for recursive calls.
   */
  innerPick(picker: PlayoutPicker, pick: PickFunction): T {
    while (true) {
      const depth = picker.depth;
      try {
        const val = this.#callback(pick);
        return val;
      } catch (e) {
        if (!(e instanceof Pruned)) {
          throw e;
        }
        if (!picker.startAt(depth)) {
          throw e; // can't recover
        }
      }
    }
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
      for (let i = 0; i < items.length; i++) {
        const val = items[i];
        const picks = new PickList([req], [i]);
        yield new Generated(picks, val);
      }
    }

    function* callbackGenerator(
      arb: Arbitrary<T>,
    ): IterableIterator<Generated<T>> {
      for (const picker of breadthFirstSearch()) {
        // Keep using the same picker until it's finished.
        let gen = arb.generate(picker);
        while (gen) {
          yield gen;
          gen = arb.generate(picker);
        }
      }
    }

    if (this.#examples) {
      return listGenerator(this.#examples);
    } else {
      return callbackGenerator(this);
    }
  }

  /**
   * The first value generated by the arbitrary.
   *
   * (Often a minimum value.)
   */
  default(): Generated<T> {
    for (const gen of this.generateAll()) {
      return gen;
    }
    throw new Error(
      `${this.label} didn't generate any values`,
    );
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
        throw new Error(
          `findGenerated for '${this.label}': no match found in the first ${limit} values`,
        );
      }
    }
    return undefined;
  }

  /**
   * Returns up to n examples from this Arbitrary, in the same order as
   * {@link generateAll}. The first one will be the default value.
   *
   * There may be duplicates.
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
   *
   * There may be duplicates.
   */
  takeAll(opts?: { limit?: number }): T[] {
    const limit = opts?.limit ?? 1000;

    const examples = this.take(limit + 1);
    if ((examples.length > limit)) {
      throw new Error(
        `takeAll for '${this.label}': array would have more than ${limit} elements`,
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
    const pickOpts: PickFunctionOpts<T> = { accept };

    if (!accept(this.default().val)) {
      // Override the default picks when picking from the unfiltered Arbitrary
      // so that the default will pass the filter.
      const gen = this.findGenerated(accept, { limit: maxTries });
      if (gen === undefined) {
        throw new Error(
          `filter: accept callback didn't match any values generated by '${this.label}'`,
        );
      }
    }

    const label = opts?.label ?? "unlabeled filter";
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
      const label = opts?.label ?? "(unlabeled)";
      return new Arbitrary(label, arg);
    } else if (Array.isArray(arg)) {
      if (arg.length === 0) {
        throw new Error("Arbitrary.from() called with an empty array");
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
      const label = opts?.label ?? "unlabeled PickRequest";
      return new Arbitrary(label, (pick) => pick(arg), { maxSize: arg.size });
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
  static of<T>(...examples: T[]): Arbitrary<T> {
    if (examples.length === 0) {
      throw new Error("Arbitrary.of() requires at least one argument");
    }
    return Arbitrary.from(examples, { label: `${examples.length} examples` });
  }

  /**
   * Creates an arbitrary that picks one of the given arbitaries and then returns it.
   */
  static oneOf<T>(
    cases: PickSet<T>[],
    opts?: ArbitraryOpts,
  ): Arbitrary<T> {
    if (cases.length === 0) {
      throw new Error("Arbitrary.oneOf() requires at least one alternative");
    }
    if (cases.length === 1) {
      return cases[0].arb;
    }

    const arbCases = cases.map((c) => c.arb);

    let maxSize: number | undefined = 0;
    for (const arb of arbCases) {
      const caseSize = arb.maxSize;
      if (caseSize === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize += caseSize;
    }

    const req = new PickRequest(0, cases.length - 1);
    const callback: ArbitraryCallback<T> = (pick) => {
      const i = pick(req);
      return arbCases[i].#callback(pick);
    };
    const label = opts?.label ?? "oneOf";
    return new Arbitrary(label, callback, { maxSize });
  }

  /**
   * Creates an Arbitrary for a record with the given shape.
   */
  static record<T extends AnyRecord>(
    shape: RecordShape<T>,
    opts?: ArbitraryOpts,
  ): Arbitrary<T> {
    const keys = Object.keys(shape) as (keyof T)[];

    let maxSize: number | undefined = 1;
    for (const key of keys) {
      const size = shape[key].arb.maxSize;
      if (size === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize *= size;
    }

    const label = opts?.label ?? "record";

    if (keys.length === 0) {
      const callback: ArbitraryCallback<T> = () => {
        return {} as T;
      };
      return new Arbitrary(label, callback, { maxSize });
    }

    const callback = (pick: PickFunction) => {
      const result = {} as Partial<T>;
      for (const key of keys) {
        result[key] = pick(shape[key]);
      }
      return result as T;
    };

    return new Arbitrary(label, callback, { maxSize });
  }
}
