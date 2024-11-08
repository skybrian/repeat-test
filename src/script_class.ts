import type {
  BuildFunction,
  ObjectShape,
  Pickable,
  PickFunction,
} from "./pickable.ts";

import { filtered } from "./results.ts";
import { Filtered } from "./pickable.ts";

/**
 * An optional interface that a Pickable can use to give itself a name and set flags.
 */
export interface HasScript<T> extends Pickable<T> {
  /**
   * The script that should be returned after calling {@link Script.from} on
   * this object. (Otherwise, an untitled script will be created that calls
   * {@link Pickable.directBuild}.)
   */
  readonly buildScript: Script<T>;
}

/**
 * Flags used to control how a script's pick calls are recorded and replayed.
 *
 * (This affects performance when shrinking test output.)
 */
export type ScriptOpts = {
  /**
   * An upper bound on the number of possible values that this script can
   * generate.
   *
   * If set, it may be feasible to iterate over all possible outputs from this
   * script.
   */
  readonly maxSize?: number;

  /**
   * If true, this script isn't immediately ready to run on startup, perhaps due
   * to a cyclic dependency. The script shouldn't be called until initailization
   * is complete.
   */
  readonly lazyInit?: boolean;

  /**
   * Turns on caching for this script's output.
   *
   * (Even with this flag on, values that don't satisfy `Object.isFrozen` won't
   * be cached.)
   */
  readonly cachable?: boolean;

  /**
   * Logs (and potentially caches) each pick call that this script makes.
   *
   * (Currently this only happens for top-level pick calls, when the script is
   * run directly.)
   */
  readonly logCalls?: boolean;
};

/**
 * Wraps a {@link BuildFunction}, giving it a name and options.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #opts: ScriptOpts;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    opts: ScriptOpts,
  ) {
    this.#name = name;
    this.#build = build;
    this.#opts = opts;
  }

  /** The name used in error messages about this script. */
  get name(): string {
    return this.#name;
  }

  /** Returns this script's flags as an object. */
  get opts(): ScriptOpts {
    return this.#opts;
  }

  /**
   * Calls this script's build function.
   */
  get directBuild(): BuildFunction<T> {
    return this.#build;
  }

  /**
   * Similar to {@link directBuild}, except that it returns {@link filtered}
   * instead of throwing {@link Filtered}.
   */
  run(pick: PickFunction): T | typeof filtered {
    try {
      return this.#build(pick);
    } catch (e) {
      if (e instanceof Filtered) {
        return filtered;
      }
      throw e;
    }
  }

  /**
   * Returns a script that builds the same thing, but with a different name or
   * build options.
   */
  with(opts: { name?: string; cachable?: boolean }): Script<T> {
    const name = opts.name ?? this.#name;
    const newOpts = { ...this.#opts };
    if (opts.cachable !== undefined) {
      newOpts.cachable = opts.cachable;
    }
    return new Script(name, this.#build, newOpts);
  }

  /**
   * Makes a new script with the given name and options.
   */
  static make<T>(
    name: string,
    build: BuildFunction<T>,
    opts?: ScriptOpts,
  ): Script<T> {
    return new Script(
      name,
      build,
      opts ?? {},
    );
  }

  /**
   * Converts any Pickable into a Script.
   *
   * If it wasn't already a Script and didn't implement HasScript, it will be
   * named 'untitled'.
   */
  static from<T>(
    arg: Pickable<T>,
    opts?: { caller: string },
  ): Script<T> {
    if (arg instanceof Script) {
      return arg;
    }

    if (
      arg === null || typeof arg !== "object" ||
      typeof arg.directBuild !== "function"
    ) {
      const caller = opts?.caller ?? "Script.from()";
      throw new Error(`${caller} called with an invalid argument`);
    }

    const props: Partial<HasScript<T>> = arg;
    if (
      props.buildScript !== undefined && props.buildScript instanceof Script
    ) {
      return props.buildScript;
    } else {
      return Script.make("untitled", arg.directBuild);
    }
  }

  /**
   * Makes a new script the generates an object with the given shape.
   */
  static object<T extends Record<string, unknown>>(
    name: string,
    shape: ObjectShape<T>,
  ): Script<T> {
    const keys: string[] = Object.keys(shape);

    const props = Object.fromEntries(
      keys.map((key) => [key, Script.from(shape[key])]),
    );

    let maxSize: number | undefined = 1;
    for (const key of keys) {
      const size = props[key].opts.maxSize;
      if (size === undefined) {
        maxSize = undefined;
        break;
      }
      maxSize *= size;
    }

    return Script.make(
      name,
      (pick: PickFunction) => {
        const result = Object.fromEntries(
          keys.map((key) => [key, pick(props[key])]),
        );
        return result as T;
      },
      { maxSize, lazyInit: true, logCalls: keys.length > 1 },
    );
  }
}

/** A script that rejects all picks. */
export const neverReturns = Script.make("neverReturns", () => {
  throw new Filtered("neverReturns rejects all picks");
});
