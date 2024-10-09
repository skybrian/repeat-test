import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";
import type { Done } from "./results.ts";

import { done } from "./results.ts";
import { Filtered } from "./pickable.ts";

/**
 * A function that transforms a value, given some picks.
 *
 * It may throw {@link Pruned} to indicate that the picks can't be used to
 * transform a value. (For example, due to filtering.)
 */
export type ThenFunction<In, Out> = (input: In, pick: PickFunction) => Out;

export interface HasScript<T> extends Pickable<T> {
  /** Generates a member of this set, given a source of picks. */
  readonly buildScript: Script<T>;
}

export type ScriptResult<T> = Done<T> | Script<T>;

export type StepFunction<T> = (
  pick: PickFunction,
) => ScriptResult<T>;

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

  get step(): StepFunction<T> {
    return this.#step;
  }

  /** Like step, but returns undefined if the picks are filtered. */
  maybeStep(pick: PickFunction): ScriptResult<T> | undefined {
    try {
      return this.#step(pick);
    } catch (e) {
      if (!(e instanceof Filtered)) {
        throw e;
      }
      return undefined; // failed edit
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
      const next = this.step(pick);
      if (next.done) {
        const val = next.val;
        return Script.make(name, (pick) => then(val, pick));
      }
      return next.then("step", then);
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

  static fromStep<T>(
    name: string,
    step: StepFunction<T>,
  ): Script<T> {
    const build = (pick: PickFunction): T => {
      let next = step(pick);
      while (!next.done) {
        next = next.step(pick);
      }
      return next.val;
    };
    return new Script(name, build, step);
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
