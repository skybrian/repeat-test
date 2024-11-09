import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";
import type { HasScript } from "./script_class.ts";
import type { ObjectShape } from "./pickable.ts";

import { filtered } from "./results.ts";
import { PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";
import { generate } from "./gen_class.ts";
import { generateDefault } from "./ordered.ts";
import { randomPlayouts } from "./random.ts";
import { filter } from "./filters.ts";

function checkRandomGenerate(script: Script<unknown>) {
  const gen = generate(script, randomPlayouts(123), { limit: 1000 });
  if (gen !== filtered) {
    return;
  }
  throw new Error(
    `can't create Arbitrary for '${script.name}' because no randomly-generated values were accepted`,
  );
}

/**
 * A set of values that can be generated on demand.
 *
 * Every Arbitrary contains a {@link default} value. Some Arbitraries define
 * {@link maxSize}, providing an upper bound on how many values they can generate.
 */
export class Arbitrary<T> implements Pickable<T>, HasScript<T> {
  readonly #script: Script<T>;

  /** Initializes an Arbitrary, given a callback function. */
  protected constructor(
    arg: Script<T>,
  ) {
    this.#script = arg;
    if (arg.opts.lazyInit !== true) {
      checkRandomGenerate(arg);
      generateDefault(this);
    }
  }

  /**
   * A short string describing this Arbitrary, for use in error messages.
   */
  get name(): string {
    return this.#script.name;
  }

  /**
   * Returns the build script for this Arbitrary.
   *
   * (Satisfies the HasScript interface. Not normally called directly.)
   */
  get buildScript(): Script<T> {
    return this.#script;
  }

  /**
   * Builds a value from picks, bypassing any caching or retries in the pick
   * function.
   */
  get directBuild(): BuildFunction<T> {
    return this.#script.directBuild;
  }

  /**
   * An upper bound on the number of values that this Arbitrary can generate.
   * (Only available for some small sets.)
   */
  get maxSize(): number | undefined {
    return this.#script.opts.maxSize;
  }

  /**
   * Creates a new Arbitrary by mapping each example to a new value. (The
   * examples are in the same order as in the original.)
   */
  map<U>(convert: (val: T) => U): Arbitrary<U> {
    const script = Script.make("map", (pick) => {
      const val = this.directBuild(pick);
      return convert(val);
    }, this.#script.opts);

    return new Arbitrary(script);
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
    return new Arbitrary(filter(this.#script, accept));
  }

  /**
   * Creates a new Arbitrary that maps each example to another Arbitrary and
   * then picks from it.
   */
  chain<U>(
    convert: (val: T) => Arbitrary<U>,
  ): Arbitrary<U> {
    const script = Script.make("chain", (pick) => {
      const val = this.directBuild(pick);
      const next = convert(val);
      return pick(next);
    }, { cachable: true });
    return new Arbitrary(script);
  }

  /**
   * Returns a new Arbitrary with a different name or other options.
   */
  with(opts: { name?: string; cachable?: boolean }): Arbitrary<T> {
    const script = this.#script.with(opts);
    return new Arbitrary(script);
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
   * Creates an Arbitrary from a {@link Pickable} or {@link BuildFunction}.
   */
  static from<T>(arg: Pickable<T> | BuildFunction<T>): Arbitrary<T> {
    if (typeof arg === "function") {
      return new Arbitrary(Script.make("untitled", arg));
    } else if (arg instanceof PickRequest) {
      const name = `${arg.min}..${arg.max}`;
      const maxSize = arg.max - arg.min + 1;

      const script = Script.make(name, (pick: PickFunction) => {
        return pick(arg);
      }, { cachable: true, logCalls: true, maxSize, lazyInit: true });

      return new Arbitrary(script) as Arbitrary<T>;
    } else if (arg instanceof Arbitrary) {
      return arg;
    }
    return new Arbitrary(Script.from(arg, { caller: "Arbitrary.from" }));
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
    function nameOfConstant(val: unknown): string {
      if (val === undefined || typeof val === "number") {
        return `${val} (constant)`;
      } else if (typeof val === "string") {
        return `"${val}" (constant)`;
      } else {
        return `a constant`;
      }
    }

    for (const example of examples) {
      if (!Object.isFrozen(example)) {
        throw new Error("Arbitrary.of() requires frozen objects");
      }
    }

    if (examples.length === 0) {
      throw new Error("Arbitrary.of() requires at least one argument");
    } else if (examples.length === 1) {
      const constant = examples[0];
      const build = Script.make(nameOfConstant(constant), () => {
        return constant;
      }, { maxSize: 1, lazyInit: true });
      return new Arbitrary(build);
    }

    const req = new PickRequest(0, examples.length - 1);
    const maxSize = examples.length;

    const name = `${examples.length} examples`;
    const build = Script.make(name, (pick) => {
      const i = pick(req);
      return examples[i];
    }, { maxSize, lazyInit: true });
    return new Arbitrary(build);
  }

  /**
   * Creates an arbitrary that picks one of the given arbitaries and then returns it.
   */
  static oneOf<T>(
    ...cases: Pickable<T>[]
  ): Arbitrary<T> {
    if (cases.length === 0) {
      throw new Error("Arbitrary.oneOf() requires at least one alternative");
    }

    // Convert to Arbitraries first, in case maxSize is defined for all of them.
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
    const scripts = caseArbs.map((arb) => arb.#script);

    const script = Script.make("oneOf", (pick) => {
      const index = pick(req);
      return scripts[index].directBuild(pick);
    }, { maxSize, lazyInit: true, cachable: true });
    return new Arbitrary(script);
  }

  /**
   * An Arbitrary that generates objects with the given properties.
   *
   * (Their prototypes will be Object.prototype.)
   */
  static object<T extends Record<string, unknown>>(
    shape: ObjectShape<T>,
  ): RowMaker<T> {
    const propCount = Object.keys(shape).length;
    const name = propCount === 0 ? "empty object" : "object";
    return new RowMaker(name, shape);
  }

  /**
   * Returns an Arbitrary that stands for another Arbitrary, which might be
   * defined later.
   *
   * Since initialization is lazy, this is useful for generating examples of
   * recursive types.
   *
   * Usually, the return type must be declared when definining an alias, because
   * TypeScript's type inference doesn't work for recursive types.
   */
  static alias<T>(init: () => Arbitrary<T>): Arbitrary<T> {
    let cache: Arbitrary<T> | undefined = undefined;

    function target(): Arbitrary<T> {
      if (cache === undefined) {
        cache = init();
      }
      return cache;
    }

    const script = Script.make("alias", (pick) => {
      return target().directBuild(pick);
    }, { lazyInit: true });

    return new Arbitrary(script);
  }
}

/**
 * An Arbitrary that's suitable for generating rows for a table.
 */
export class RowMaker<T extends Record<string, unknown>> extends Arbitrary<T> {
  readonly #shape: ObjectShape<T>;

  constructor(name: string, shape: ObjectShape<T>) {
    super(Script.object(name, shape));
    this.#shape = shape;
  }

  /** Returns the Pickable for each property. */
  get shape(): ObjectShape<T> {
    return this.#shape;
  }
}
