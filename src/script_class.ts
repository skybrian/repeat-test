import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";
import type { Done } from "./results.ts";

import { done } from "./results.ts";
import { Filtered } from "./pickable.ts";

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

/** Converts a StepFunction to a BuildFunction. */
function stepToBuild<T>(step: StepFunction<T>): BuildFunction<T> {
  return (pick: PickFunction): T => {
    let next = step(pick);
    while (!next.done) {
      next = next.innerStep(pick);
    }
    return next.val;
  };
}

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

  constructor(readonly innerStep: StepFunction<T>) {
    this.buildFrom = stepToBuild(innerStep);
  }

  /**
   * Reads picks and calculates the next step, or the final result.
   *
   * Returns {@link filtered} if the picks can't be used to build the value.
   */
  step(pick: PickFunction): ScriptResult<T> | typeof filtered {
    try {
      return this.innerStep(pick);
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
      const next = this.innerStep(pick);
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
export function paused<T>(innerStep: StepFunction<T>): Paused<T> {
  return new Paused(innerStep);
}

/**
 * A Pickable that can pause.
 */
export class Script<T> implements Pickable<T> {
  readonly done = false; // To distinguish it from a Done result.

  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #step: StepFunction<T>;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    step: StepFunction<T>,
  ) {
    this.#name = name;
    this.#build = build;
    this.#step = step;
  }

  get name(): string {
    return this.#name;
  }

  get buildFrom(): BuildFunction<T> {
    return this.#build;
  }

  /**
   * Pauses at the beginning of the script.
   */
  get paused(): ScriptResult<T> {
    return new Paused(this.#step);
  }

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

  with(opts: { name: string }): Script<T> {
    return new Script(opts.name, this.#build, this.#step);
  }

  then<Out>(name: string, then: ThenFunction<T, Out>): Script<Out> {
    const build = (pick: PickFunction): Out => {
      const val = this.buildFrom(pick);
      return then(val, pick);
    };

    const step = (pick: PickFunction): ScriptResult<Out> => {
      const next = this.#step(pick);
      if (next.done) {
        const val = next.val;
        return paused((pick) => done(then(val, pick)));
      }
      return next.then(then);
    };

    return new Script(name, build, step);
  }

  static make<T>(
    name: string,
    build: BuildFunction<T>,
  ): Script<T> {
    const step = (pick: PickFunction): ScriptResult<T> => done(build(pick));
    return new Script(name, build, step);
  }

  static fromPaused<T>(name: string, paused: Paused<T>): Script<T> {
    return new Script(name, paused.buildFrom, paused.innerStep);
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
