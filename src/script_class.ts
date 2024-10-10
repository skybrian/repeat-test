import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";
import type { Done } from "./results.ts";

import { done } from "./results.ts";
import { Filtered } from "./pickable.ts";
import { assert } from "@std/assert/assert";

/**
 * A script may pause instead of returning a value.
 */
export type ScriptResult<T> = Done<T> | Paused<T>;

/**
 * Like a {@link BuildFunction}, except that it can pause.
 *
 * (May throw {@link Filtered}.)
 */
export type StepFunction<T> = (pick: PickFunction) => ScriptResult<T>;

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
 * Value returned by {@link Paused.step} instead of throwing {@link Filtered}.
 */
export const filtered = Symbol("filtered");

/**
 * A paused script. It may resume more than once.
 */
export class Paused<T> implements Pickable<T> {
  readonly done = false; // To distinguish it from a Done result.
  readonly buildFrom: BuildFunction<T>;
  readonly #step: StepFunction<T>;

  constructor(step: StepFunction<T>) {
    this.buildFrom = (pick: PickFunction): T => {
      let next = step(pick);
      while (!next.done) {
        next = next.#step(pick);
      }
      return next.val;
    };
    this.#step = step;
  }

  /**
   * Reads picks and calculates the next step, or the final result.
   *
   * Returns {@link filtered} if the picks can't be used to build the value.
   */
  step(pick: PickFunction): ScriptResult<T> | typeof filtered {
    try {
      return this.#step(pick);
    } catch (e) {
      if (!(e instanceof Filtered)) {
        throw e;
      }
      return filtered; // failed edit
    }
  }

  /**
   * Returns a new Paused value that will take an additional step at the end,
   * calling the given function.
   */
  then<Out>(
    then: ThenFunction<T, Out>,
  ): Paused<Out> {
    const innerStep = (pick: PickFunction): ScriptResult<Out> => {
      const next = this.#step(pick);
      if (next.done) {
        const val = next.val;
        return paused((pick) => done(then(val, pick)));
      }
      return next.then(then);
    };

    return paused(innerStep);
  }
}

/**
 * Returns a {@link Paused} value that will call the given function to take the
 * next step.
 */
export function paused<T>(step: StepFunction<T>): Paused<T> {
  return new Paused(step);
}

/**
 * A Pickable that can pause.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #start: ScriptResult<T>;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    start: ScriptResult<T>,
  ) {
    this.#name = name;
    this.#build = build;
    this.#start = start;
  }

  get name(): string {
    return this.#name;
  }

  get buildFrom(): BuildFunction<T> {
    return this.#build;
  }

  /**
   * Pauses at the beginning of the script.
   *
   * In the case of a constant, this will be a Done result.
   */
  get paused(): ScriptResult<T> {
    return this.#start;
  }

  with(opts: { name: string }): Script<T> {
    return new Script(opts.name, this.#build, this.#start);
  }

  then<Out>(name: string, then: ThenFunction<T, Out>): Script<Out> {
    const build = (pick: PickFunction): Out => {
      const val = this.buildFrom(pick);
      return then(val, pick);
    };

    if (this.#start.done) {
      const val = this.#start.val;
      const step = (pick: PickFunction) => done(then(val, pick));
      return new Script(name, build, paused(step));
    }

    return new Script(name, build, this.#start.then(then));
  }

  /**
   * Returns a script that's already finished, with the given value.
   */
  static constant<T>(name: string, val: T): Script<T> {
    assert(Object.isFrozen(val));
    return new Script(name, () => val, done(val));
  }

  static make<T>(
    name: string,
    build: BuildFunction<T>,
  ): Script<T> {
    const step = (pick: PickFunction): ScriptResult<T> => done(build(pick));
    return new Script(name, build, paused(step));
  }

  static fromPaused<T>(name: string, paused: Paused<T>): Script<T> {
    return new Script(name, paused.buildFrom, paused);
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
