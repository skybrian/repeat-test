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
 * Some Pickables can pause instead of returning a value immediately.
 */
export interface HasScript<T> extends Pickable<T> {
  /**
   * Returns a script that builds the same values as {@link Pickable.buildFrom},
   * but may also pause.
   */
  readonly buildScript: Script<T>;
}

export type ScriptOpts = {
  readonly cachable?: boolean;

  /**
   * Turns on individual call logging for this script.
   */
  readonly splitCalls?: boolean;
};

/**
 * A Pickable that can pause.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #opts?: ScriptOpts;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    opts?: ScriptOpts,
  ) {
    this.#name = name;
    this.#build = build;
    this.#opts = opts;
  }

  get name(): string {
    return this.#name;
  }

  get cachable(): boolean {
    return this.#opts?.cachable === true;
  }

  get splitCalls(): boolean {
    return this.#opts?.splitCalls === true;
  }

  get buildFrom(): BuildFunction<T> {
    return this.#build;
  }

  build(pick: PickFunction): T | typeof filtered {
    try {
      return this.#build(pick);
    } catch (e) {
      if (e instanceof Filtered) {
        return filtered;
      }
      throw e;
    }
  }

  with(opts: { name?: string; cachable?: boolean }): Script<T> {
    const name = opts.name ?? this.#name;
    if (opts.cachable === undefined) {
      return new Script(name, this.#build, this.#opts);
    }
    const newOpts = { ...this.#opts, cachable: opts.cachable };
    return new Script(name, this.#build, newOpts);
  }

  then<Out>(
    name: string,
    then: ThenFunction<T, Out>,
    opts?: ScriptOpts,
  ): Script<Out> {
    const build = (pick: PickFunction): Out => {
      const val = this.buildFrom(pick);
      return then(val, pick);
    };

    return Script.make(name, build, opts);
  }

  static make<T>(
    name: string,
    build: BuildFunction<T>,
    opts?: ScriptOpts,
  ): Script<T> {
    return new Script(name, build, opts);
  }

  static from<T>(
    arg: Pickable<T>,
    opts?: { caller: string },
  ): Script<T> {
    if (arg instanceof Script) {
      return arg;
    }

    if (
      arg === null || typeof arg !== "object" ||
      typeof arg.buildFrom !== "function"
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
      return Script.make("untitled", arg.buildFrom);
    }
  }

  /** A script that never completes. */
  static filtered = Script.make("filtered", () => {
    throw new Filtered("rejects all picks");
  });
}
