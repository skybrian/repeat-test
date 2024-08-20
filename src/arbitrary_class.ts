import { assert } from "@std/assert";
import type { AnyRecord } from "./types.ts";
import { PickRequest } from "./picks.ts";
import { generate } from "./generated.ts";
import type {
  Generated,
  PickCallback,
  PickFunction,
  PickSet,
} from "./generated.ts";
import { PlayoutSearch } from "./searches.ts";

/**
 * Specifies a record to be generated.
 *
 * Each field will be independently generated.
 */
export type RecordShape<T> = {
  [K in keyof T]: PickSet<T[K]>;
};

/**
 * Options when defining a new Arbitrary.
 */
export type ArbitraryOpts = {
  /**
   * A short string that can be used to identify an arbitrary in error messages.
   * If not provided, a default label will be used.
   */
  label?: string;
};

type ConstructorOpts<T> = {
  examples?: T[];
  maxSize?: number;
  dryRun?: boolean;
};

/**
 * A set of values that can be generated on demand.
 *
 * Every Arbitrary contains a {@link default} value. Some Arbitraries define
 * {@link maxSize}, providing an upper bound on how many values they can generate.
 */
export class Arbitrary<T> implements PickSet<T> {
  readonly #label: string;
  readonly #callback: PickCallback<T>;

  readonly #examples: T[] | undefined;
  readonly #maxSize: number | undefined;

  /** Initializer for a subclass that generates the same values as another Arbitrary. */
  protected constructor(arb: Arbitrary<T>);
  /** Initializes an Arbitrary, given a callback function. */
  protected constructor(
    label: string,
    callback: PickCallback<T>,
    opts?: ConstructorOpts<T>,
  );
  /** Initializes a callback or another Arbitrary. */
  protected constructor(
    arg: Arbitrary<T> | string,
    callback?: PickCallback<T>,
    opts?: ConstructorOpts<T>,
  ) {
    if (arg instanceof Arbitrary) {
      this.#label = arg.#label;
      this.#callback = arg.#callback;
      this.#examples = arg.#examples;
      this.#maxSize = arg.#maxSize;
    } else {
      const label = arg;
      assert(typeof label === "string");
      assert(typeof callback === "function");
      this.#label = label;
      this.#callback = callback;
      this.#examples = opts?.examples;
      this.#maxSize = opts?.maxSize;
      if (opts?.dryRun !== false) {
        this.default(); // dry run
      }
    }
  }

  /**
   * A short string describing this Arbitrary, for use in error messages.
   */
  get label(): string {
    return this.#label;
  }

  /**
   * Returns a bound function that can be used to generate values of this
   * Arbitrary.
   *
   * (Satisfies the {@link PickSet} interface. Not normally called directly.)
   */
  get generateFrom(): PickCallback<T> {
    return this.#callback;
  }

  /**
   * An upper bound on the number of values that this Arbitrary can generate.
   * (Only available for some small sets.)
   */
  get maxSize(): number | undefined {
    return this.#maxSize;
  }

  /**
   * Returns one of the values of this Arbitrary, along with the picks used to
   * generate it.
   *
   * Usually it's a zero or minimum value. Shrinking will return this value when
   * possible.
   *
   * It's guaranteed that every Arbitrary has a default value. (The constructor
   * will fail otherwise.)
   */
  default(): Generated<T> {
    const search = new PlayoutSearch();
    const gen = generate(this, search);
    if (gen === undefined) {
      throw new Error(
        `${this.label} didn't generate any values`,
      );
    }
    return gen;
  }

  /**
   * Creates a new Arbitrary by mapping each example to a new value. (The
   * examples are in the same order as in the original.)
   */
  map<U>(convert: (val: T) => U, opts?: ArbitraryOpts): Arbitrary<U> {
    const label = opts?.label ?? "map";
    const callback: PickCallback<U> = (pick) => {
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
   * @throws if no value can be found that passes the filter.
   */
  filter(
    accept: (val: T) => boolean,
    opts?: { label?: string },
  ): Arbitrary<T> {
    const label = opts?.label ??
      (this.label.endsWith("(filtered)")
        ? this.label
        : `${this.label} (filtered)`);
    const callback: PickCallback<T> = (pick) => {
      return pick(this, { accept });
    };
    const maxSize = this.maxSize;
    return new Arbitrary(label, callback, { maxSize });
  }

  /**
   * Creates a new Arbitrary that maps each example to another Arbitrary and
   * then picks from it.
   *
   * (This method is provided because it's traditional, but in most cases,
   * {@link Arbitrary.from} with a callback is more flexible.)
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
    opts?: ArbitraryOpts,
  ): Arbitrary<U> {
    const label = opts?.label ?? "chain";
    const callback: PickCallback<U> = (pick) => {
      const output = pick(this);
      const next = convert(output);
      return pick(next);
    };
    return new Arbitrary(label, callback);
  }

  /**
   * Returns a new Arbitrary with a different label.
   */
  with(opts: { label: string }): Arbitrary<T> {
    return new Arbitrary(opts.label, this.#callback, {
      examples: this.#examples,
      maxSize: this.#maxSize,
      dryRun: false,
    });
  }

  /**
   * Creates a function that always returns this Arbitrary.
   *
   * (Useful when optional arguments might be added later.)
   */
  asFunction(): () => Arbitrary<T> {
    return () => this;
  }

  /**
   * A short string describing this Arbitrary, for debugging.
   */
  toString(): string {
    return `Arbitrary(${this.label})`;
  }

  /**
   * Converts a {@link PickRequest} to an Arbitrary.
   */
  static from(req: PickRequest, opts?: { label?: string }): Arbitrary<number>;
  /**
   * Creates an Arbitrary from a {@link PickCallback}, or an array of examples.
   */
  static from<T>(
    callback: PickCallback<T> | PickSet<T>,
    opts?: { label?: string },
  ): Arbitrary<T>;
  /**
   * Creates an Arbitrary from a {@link PickRequest}, a {@link PickCallback}, or an array of examples.
   */
  static from<T>(
    arg: PickRequest | PickCallback<T> | PickSet<T>,
    opts?: { label?: string },
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      const label = opts?.label ?? "(unlabeled)";
      return new Arbitrary(label, arg);
    } else if (arg instanceof PickRequest) {
      const label = opts?.label ?? `${arg.min}..${arg.max}`;
      const maxSize = arg.max - arg.min + 1;
      return new Arbitrary(label, (pick) => pick(arg), {
        maxSize,
        dryRun: false,
      });
    } else if (arg instanceof Arbitrary) {
      return arg;
    }
    const generateFrom = arg["generateFrom"];
    if (typeof generateFrom === "function") {
      let label = arg["label"];
      assert(typeof label === "string");
      label = opts?.label ?? label;
      return new Arbitrary(label, generateFrom);
    }
    throw new Error("invalid argument to Arbitrary.from");
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
      const label = "constant";
      const constant = examples[0];
      return new Arbitrary(label, () => constant, {
        maxSize: 1,
        dryRun: false,
      });
    }

    const req = new PickRequest(0, examples.length - 1);

    const label = `${examples.length} examples`;
    const callback: PickCallback<T> = (pick) => {
      const i = pick(req);
      return examples[i];
    };
    return new Arbitrary(label, callback, {
      examples,
      maxSize: examples.length,
      dryRun: false,
    });
  }

  /**
   * Creates an arbitrary that picks one of the given arbitaries and then returns it.
   */
  static oneOf<T>(
    ...cases: PickSet<T>[]
  ): Arbitrary<T> {
    if (cases.length === 0) {
      throw new Error("Arbitrary.oneOf() requires at least one alternative");
    }
    const arbCases = cases.map((c) => Arbitrary.from(c));
    if (arbCases.length === 1) {
      return arbCases[0];
    }

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
    const callback: PickCallback<T> = (pick) => {
      const i = pick(req);
      return arbCases[i].#callback(pick);
    };
    const label = "oneOf";
    return new Arbitrary(label, callback, { maxSize, dryRun: false });
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
      const size = Arbitrary.from(shape[key]).maxSize;
      if (size === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize *= size;
    }

    const label = opts?.label ?? "record";

    if (keys.length === 0) {
      const callback: PickCallback<T> = () => {
        return {} as T;
      };
      return new Arbitrary(label, callback, { maxSize, dryRun: false });
    }

    const callback = (pick: PickFunction) => {
      const result = {} as Partial<T>;
      for (const key of keys) {
        result[key] = pick(shape[key]);
      }
      return result as T;
    };

    return new Arbitrary(label, callback, { maxSize, dryRun: false });
  }
}
