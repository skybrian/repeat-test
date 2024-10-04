import type { RecordShape } from "./options.ts";
import type { BuildFunction, PickFunction, PickSet } from "./build.ts";

import { assert } from "@std/assert";

import { PickRequest } from "./picks.ts";
import { generate, Script } from "./build.ts";
import { generateDefault } from "./ordered.ts";
import { randomPlayouts } from "./random.ts";

type ConstructorOpts<T> = {
  examples?: T[];
  maxSize?: number;
  dryRun?: boolean;
};

function checkRandomGenerate(script: Script<unknown>) {
  const gen = generate(script, randomPlayouts(123), { limit: 1000 });
  if (gen !== undefined) {
    return;
  }
  throw new Error(`${script.name} couldn't generate a random value.`);
}

/**
 * A set of values that can be generated on demand.
 *
 * Every Arbitrary contains a {@link default} value. Some Arbitraries define
 * {@link maxSize}, providing an upper bound on how many values they can generate.
 */
export class Arbitrary<T> implements PickSet<T> {
  readonly #script: Script<T>;

  readonly #examples: T[] | undefined;
  readonly #maxSize: number | undefined;

  /** Initializer for a subclass that generates the same values as another Arbitrary. */
  protected constructor(arb: Arbitrary<T>);
  /** Initializes an Arbitrary, given a callback function. */
  protected constructor(
    buildScript: Script<T>,
    opts?: ConstructorOpts<T>,
  );
  /** Initializes a callback or another Arbitrary. */
  protected constructor(
    arg: Arbitrary<T> | Script<T>,
    opts?: ConstructorOpts<T>,
  ) {
    if (arg instanceof Arbitrary) {
      this.#script = arg.#script;
      this.#examples = arg.#examples;
      this.#maxSize = arg.#maxSize;
    } else {
      assert(arg instanceof Script);
      this.#script = arg;
      this.#examples = opts?.examples;
      this.#maxSize = opts?.maxSize;
      if (opts?.dryRun !== false) {
        checkRandomGenerate(arg);
        generateDefault(this);
      }
    }
  }

  /**
   * A short string describing this Arbitrary, for use in error messages.
   */
  get name(): string {
    return this.#script.name;
  }

  /**
   * Returns the build function for this Arbitrary.
   *
   * (Satisfies the {@link PickSet} interface. Not normally called directly.)
   */
  get buildScript(): Script<T> {
    return this.#script;
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
    const build = this.#script.then("map", convert);
    const maxSize = this.maxSize;
    return new Arbitrary(build, { maxSize });
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
    // Check that accept() returns often enough.
    // Based on biased coin simulation:
    // https://claude.site/artifacts/624afebe-b86f-4e33-9e30-5414dc7c810b

    let threshold = 2;
    const playouts = randomPlayouts(123);
    let accepted = 0;
    let total = 0;
    const maxTries = 50;
    while (total < maxTries) {
      const gen = generate(this, playouts, { limit: 1000 });
      if (gen === undefined) {
        break; // visited all values
      }
      total++;
      if (accept(gen.val)) {
        accepted++;
        if (accepted >= threshold) {
          break;
        }
      }
    }

    if (total < maxTries) {
      threshold = 1; // small arbitraries only need to pass one value through
    }
    if (accepted < threshold) {
      throw new Error(
        `${this.name} filter didn't allow enough values through; want: ${threshold} of ${total}, got: ${accepted}`,
      );
    }

    const name = this.name.endsWith("(filtered)")
      ? this.name
      : `${this.name} (filtered)`;

    const build = Script.make(name, (pick) => {
      return pick(this, { accept });
    });

    // Check that a default exists
    generateDefault(build);

    const maxSize = this.maxSize;
    return new Arbitrary(build, { maxSize, dryRun: false });
  }

  /**
   * Creates a new Arbitrary that maps each example to another Arbitrary and
   * then picks from it.
   *
   * (Although less convenient than calling {@link Arbitrary.from} with a
   * function, it sometimes allows the intermediate value to be cached.)
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
  ): Arbitrary<U> {
    const build = this.#script.then("chain", (val, pick) => {
      const next = convert(val);
      return pick(next);
    });
    return new Arbitrary(build);
  }

  /**
   * Returns a new Arbitrary with a different name.
   */
  with(opts: { name: string }): Arbitrary<T> {
    const script = this.#script.with(opts);

    return new Arbitrary(script, {
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
    return `${this.constructor.name}('${this.name}')`;
  }

  /**
   * Converts a {@link PickRequest} to an Arbitrary.
   */
  static from(req: PickRequest): Arbitrary<number>;
  /**
   * Creates an Arbitrary from a {@link BuildFunction} or {@link PickSet}.
   */
  static from<T>(
    arg: BuildFunction<T> | PickSet<T>,
  ): Arbitrary<T>;
  /**
   * Creates an Arbitrary from a {@link PickRequest}, a {@link BuildFunction}, or a {@link PickSet}.
   */
  static from<T>(
    arg: PickRequest | BuildFunction<T> | PickSet<T>,
  ): Arbitrary<T> | Arbitrary<number> {
    if (typeof arg === "function") {
      return new Arbitrary(Script.make("(unlabeled)", arg));
    } else if (arg instanceof PickRequest) {
      const name = `${arg.min}..${arg.max}`;
      const maxSize = arg.max - arg.min + 1;
      const build = Script.make(name, (pick: PickFunction) => {
        return pick(arg);
      });
      return new Arbitrary(build, {
        maxSize,
        dryRun: false,
      });
    } else if (arg instanceof Arbitrary) {
      return arg;
    }
    const script = arg["buildScript"];
    if (!(script instanceof Script)) {
      throw new Error("invalid argument to Arbitrary.from");
    }
    return new Arbitrary(script);
  }

  /**
   * Creates an Arbitrary that returns one of the given arguments.
   *
   * There must be at least one argument. The first argument will be the default
   * value.
   *
   * Rather than being generated each time, the items returned as-is. To guard
   * against errors, Arbitrary.of() requires each argument to be frozen.
   * (Primitive values are allowed.)
   *
   * Consider using {@link from} to generate a new instance of mutable objects
   * each time.
   */
  static of<T>(...examples: T[]): Arbitrary<T> {
    for (const example of examples) {
      if (!Object.isFrozen(example)) {
        throw new Error("Arbitrary.of() requires frozen objects");
      }
    }

    if (examples.length === 0) {
      throw new Error("Arbitrary.of() requires at least one argument");
    } else if (examples.length === 1) {
      const constant = examples[0];
      const build = Script.make("untitled constant", () => {
        return constant;
      });
      return new Arbitrary(build, {
        maxSize: 1,
        dryRun: false,
      });
    }

    const req = new PickRequest(0, examples.length - 1);

    const name = `${examples.length} examples`;
    const build = Script.make(name, (pick) => {
      const i = pick(req);
      return examples[i];
    });
    return new Arbitrary(build, {
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
    const caseArbs = cases.map((c) => Arbitrary.from(c));
    if (caseArbs.length === 1) {
      return caseArbs[0];
    }

    let maxSize: number | undefined = 0;
    for (const arb of caseArbs) {
      const caseSize = arb.maxSize;
      if (caseSize === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize += caseSize;
    }

    const req = new PickRequest(0, cases.length - 1);
    const caseScripts = caseArbs.map((arb) => arb.#script);

    const build = Script.make("oneOf", (pick) => {
      const i = pick(req);
      return caseScripts[i].build(pick);
    });
    return new Arbitrary(build, { maxSize, dryRun: false });
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
      const build = Script.make("empty record", () => {
        return {} as T;
      });
      return new Arbitrary(build, {
        maxSize,
        dryRun: false,
      });
    }

    const build = Script.make("record", (pick: PickFunction) => {
      const result = {} as Partial<T>;
      for (const key of keys) {
        result[key] = pick(shape[key]);
      }
      return result as T;
    });

    return new Arbitrary(build, { maxSize, dryRun: false });
  }
}
