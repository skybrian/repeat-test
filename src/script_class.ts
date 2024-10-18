import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";

import { filtered } from "./results.ts";
import { Filtered } from "./pickable.ts";

/** Distinguishes a finished result from one that's still in progress. */
export type Done<T> = { readonly done: true; readonly val: T };

export function done<T>(val: T): Done<T> {
  return { done: true, val };
}

/**
 * Returned by a step function to indicate that there's another step.
 */
export type Resume<T> = {
  readonly done: false;
  readonly step: StepFunction<T>;
  readonly label?: string;
};

/**
 * Like a {@link BuildFunction}, except that it can pause.
 *
 * (May throw {@link Filtered}.)
 */
export type StepFunction<T> = (pick: PickFunction) => Done<T>;

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

/**
 * A paused script. It may resume more than once.
 */
export class Paused<T> {
  readonly #step: StepFunction<T>;
  readonly key = 0;

  private constructor(
    step: StepFunction<T>,
  ) {
    this.#step = step;
  }

  get done(): false {
    return false;
  }

  /**
   * Reads picks and calculates the next step, or the final result.
   *
   * Returns {@link filtered} if the picks can't be used to build the value.
   */
  step(pick: PickFunction): Done<T> | typeof filtered {
    try {
      return this.#step(pick);
    } catch (e) {
      if ((e instanceof Filtered)) {
        return filtered;
      }
      throw e;
    }
  }

  /** Pauses at the start of a script.  */
  static atStart<T>(step: StepFunction<T>): Paused<T> {
    return new Paused(step);
  }
}

export type ScriptOpts = {
  readonly cachable: boolean;
};

/**
 * A Pickable that can pause.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #start: Paused<T>;
  readonly #opts: ScriptOpts;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    start: Paused<T>,
    opts: ScriptOpts,
  ) {
    this.#name = name;
    this.#build = build;
    this.#start = start;
    this.#opts = opts;
  }

  get name(): string {
    return this.#name;
  }

  get cachable(): boolean {
    return this.#opts.cachable;
  }

  get buildFrom(): BuildFunction<T> {
    return this.#build;
  }

  /**
   * Pauses at the beginning of the script.
   */
  get paused(): Paused<T> {
    return this.#start;
  }

  with(opts: { name: string }): Script<T> {
    return new Script(opts.name, this.#build, this.#start, this.#opts);
  }

  then<Out>(
    name: string,
    then: ThenFunction<T, Out>,
    opts?: ScriptOpts,
  ): Script<Out> {
    opts = opts ?? { cachable: false };

    const build = (pick: PickFunction): Out => {
      const val = this.buildFrom(pick);
      return then(val, pick);
    };

    return Script.make(name, build);
  }

  static make<T>(
    name: string,
    build: BuildFunction<T>,
    opts?: ScriptOpts,
  ): Script<T> {
    opts = opts ?? { cachable: false };
    const step = (pick: PickFunction) => done(build(pick));
    return new Script(name, build, Paused.atStart(step), opts);
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
}
