import { assert } from "@std/assert";
import { PickRequest } from "./picks.ts";
import { generateDefault } from "./multipass_search.ts";

import type { PickCallback, PickFunction, PickSet } from "./generated.ts";
import type { RecordShape } from "./options.ts";

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
  readonly #callback: PickCallback<T>;
  readonly #label: string;

  readonly #examples: T[] | undefined;
  readonly #maxSize: number | undefined;

  /** Initializer for a subclass that generates the same values as another Arbitrary. */
  protected constructor(arb: Arbitrary<T>);
  /** Initializes an Arbitrary, given a callback function. */
  protected constructor(
    callback: PickCallback<T>,
    label: string,
    opts?: ConstructorOpts<T>,
  );
  /** Initializes a callback or another Arbitrary. */
  protected constructor(
    arg: Arbitrary<T> | PickCallback<T>,
    label?: string,
    opts?: ConstructorOpts<T>,
  ) {
    if (arg instanceof Arbitrary) {
      this.#callback = arg.#callback;
      this.#label = arg.#label;
      this.#examples = arg.#examples;
      this.#maxSize = arg.#maxSize;
    } else {
      assert(typeof arg === "function");
      assert(label !== undefined);
      this.#callback = arg;
      this.#label = label;
      this.#examples = opts?.examples;
      this.#maxSize = opts?.maxSize;
      if (opts?.dryRun !== false) {
        generateDefault(this); // dry run
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
   * Creates a new Arbitrary by mapping each example to a new value. (The
   * examples are in the same order as in the original.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    const callback: PickCallback<U> = (pick) => {
      const output = pick(this);
      return convert(output);
    };
    const maxSize = this.maxSize;
    return new Arbitrary(callback, "map", { maxSize });
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
  ): Arbitrary<T> {
    const label = this.label.endsWith("(filtered)")
      ? this.label
      : `${this.label} (filtered)`;
    const callback: PickCallback<T> = (pick) => {
      return pick(this, { accept });
    };
    const maxSize = this.maxSize;
    return new Arbitrary(callback, label, { maxSize });
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
  ): Arbitrary<U> {
    const callback: PickCallback<U> = (pick) => {
      const output = pick(this);
      const next = convert(output);
      return pick(next);
    };
    return new Arbitrary(callback, "chain");
  }

  /**
   * Returns a new Arbitrary with a different label.
   */
  with(opts: { label: string }): Arbitrary<T> {
    return new Arbitrary(this.#callback, opts.label, {
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
  static from(req: PickRequest): Arbitrary<number>;
  /**
   * Creates an Arbitrary from a {@link PickCallback}, or an array of examples.
   */
  static from<T>(
    callback: PickCallback<T> | PickSet<T>,
  ): Arbitrary<T>;
  /**
   * Creates an Arbitrary from a {@link PickRequest}, a {@link PickCallback}, or an array of examples.
   */
  static from<T>(
    arg: PickRequest | PickCallback<T> | PickSet<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      return new Arbitrary(arg, "(unlabeled)");
    } else if (arg instanceof PickRequest) {
      const label = `${arg.min}..${arg.max}`;
      const maxSize = arg.max - arg.min + 1;
      const pickFromRange = (pick: PickFunction) => {
        return pick(arg);
      };
      return new Arbitrary(pickFromRange, label, {
        maxSize,
        dryRun: false,
      });
    } else if (arg instanceof Arbitrary) {
      return arg;
    }
    const generateFrom = arg["generateFrom"];
    if (typeof generateFrom === "function") {
      const label = arg["label"];
      assert(typeof label === "string");
      return new Arbitrary(generateFrom, label);
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
      const constant = examples[0];
      return new Arbitrary(() => constant, "constant", {
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
    return new Arbitrary(callback, label, {
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
    return new Arbitrary(callback, "oneOf", { maxSize, dryRun: false });
  }

  /**
   * Creates an Arbitrary for a record with the given shape.
   */
  static record<T extends Record<string, unknown>>(
    shape: RecordShape<T>,
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

    if (keys.length === 0) {
      const callback: PickCallback<T> = () => {
        return {} as T;
      };
      return new Arbitrary(callback, "empty record", {
        maxSize,
        dryRun: false,
      });
    }

    const callback = (pick: PickFunction) => {
      const result = {} as Partial<T>;
      for (const key of keys) {
        result[key] = pick(shape[key]);
      }
      return result as T;
    };

    return new Arbitrary(callback, "record", { maxSize, dryRun: false });
  }
}
