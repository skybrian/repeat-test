import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";

import { filtered } from "./results.ts";
import { Filtered } from "./pickable.ts";

/**
 * A function that transforms a value, given some picks.
 *
 * (May throw {@link Filtered}.)
 */
export type ThenFunction<In, Out> = (input: In, pick: PickFunction) => Out;

/**
 * An optional interface that a Pickable can use to give itself a name and set
 * build flags.
 */
export interface HasScript<T> extends Pickable<T> {
  /**
   * The script that should be returned after calling {@link Script.from} on
   * this object. (Otherwise, an untitled script will be created that calls
   * {@link Pickable.directBuild}.)
   */
  readonly buildScript: Script<T>;
}

export type ScriptOpts = {
  /**
   * Turns on caching for this script. This will only have an effect if the
   * script builds values that satisfy `Object.isFrozen`.
   */
  readonly cachable?: boolean;

  /**
   * Turns on individual call logging for this script.
   */
  readonly logCalls?: boolean;
};

/**
 * A Pickable with a name and build options.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #cachable: boolean;
  readonly #logCalls: boolean;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    cachable: boolean,
    logCalls: boolean,
  ) {
    this.#name = name;
    this.#build = build;
    this.#cachable = cachable;
    this.#logCalls = logCalls;
  }

  get name(): string {
    return this.#name;
  }

  get cachable(): boolean {
    return this.#cachable;
  }

  get logCalls(): boolean {
    return this.#logCalls;
  }

  get opts(): ScriptOpts {
    return {
      cachable: this.#cachable,
      logCalls: this.#logCalls,
    };
  }

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
    const cachable = opts.cachable !== undefined
      ? opts.cachable
      : this.#cachable;
    return new Script(name, this.#build, cachable, this.#logCalls);
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
      opts?.cachable === true,
      opts?.logCalls === true,
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

  /** A script that rejects all picks. */
  static neverReturns = Script.make("neverReturns", () => {
    throw new Filtered("neverReturns rejects all picks");
  });
}
