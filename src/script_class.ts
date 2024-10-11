import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";

import { assert } from "@std/assert/assert";
import { filtered } from "./results.ts";
import { Filtered } from "./pickable.ts";

/** Distinguishes a finished result from one that's still in progress. */
export type Done<T> = { readonly done: true; readonly val: T };

export function done<T>(val: T): Done<T> {
  return { done: true, val };
}

const alwaysBuild = Symbol("alwaysBuild");

/**
 * A Done result that rebuilds the value after its first access.
 *
 * (For returning mutable objects.)
 */
export function cacheOnce<T>(val: T, build: () => T): Done<T> {
  let cache: T | typeof alwaysBuild = val;

  return {
    done: true,
    get val() {
      if (cache === alwaysBuild) {
        return build();
      }
      const val = cache;
      cache = alwaysBuild;
      return val;
    },
  };
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
export type StepFunction<T> = (pick: PickFunction) => Done<T> | Resume<T>;

/**
 * Returns a {@link Paused} value that will call the given function to take the
 * next step.
 */
export function resume<T>(step: StepFunction<T>): Resume<T> {
  return { done: false, step };
}

export function resumeAt<T>(label: string, step: StepFunction<T>): Resume<T> {
  return { done: false, step, label };
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
 * A paused script. It may resume more than once.
 */
export class Paused<T> implements Pickable<T> {
  readonly buildFrom: BuildFunction<T>;
  readonly #step: StepFunction<T>;
  readonly key: string | number;

  private constructor(
    step: StepFunction<T>,
    private readonly index: number,
    private readonly label: string | undefined,
  ) {
    this.key = label ? `${this.index}.${label}` : this.index;
    this.buildFrom = (pick: PickFunction): T => {
      let next = step(pick);
      while (!next.done) {
        next = next.step(pick);
      }
      return next.val;
    };
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
  step(pick: PickFunction): Paused<T> | Done<T> | typeof filtered {
    try {
      const result = this.#step(pick);
      if (result.done) {
        return result;
      }
      if (result.label !== undefined) {
        return new Paused(result.step, this.index, result.label);
      } else {
        return new Paused(result.step, this.index + 1, undefined);
      }
    } catch (e) {
      if ((e instanceof Filtered)) {
        return filtered;
      }
      throw e;
    }
  }

  /**
   * Returns a new Paused value that will take an additional step at the end,
   * calling the given function.
   */
  then<Out>(then: ThenFunction<T, Out>): Paused<Out> {
    // Adding a step to the end doesn't change the current key.
    return new Paused(
      Paused.addToEnd(this.#step, then),
      this.index,
      this.label,
    );
  }

  /** Pauses at the start of a script.  */
  static atStart<T>(step: StepFunction<T>): Paused<T> {
    return new Paused(step, 0, undefined);
  }

  private static addToEnd<T, Out>(
    first: StepFunction<T>,
    then: ThenFunction<T, Out>,
  ): StepFunction<Out> {
    return (pick: PickFunction): Done<Out> | Resume<Out> => {
      const next = first(pick);
      if (next.done) {
        const val = next.val;
        return resume((pick) => done(then(val, pick)));
      }
      return resume(Paused.addToEnd(next.step, then));
    };
  }
}

/**
 * A Pickable that can pause.
 */
export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #start: Done<T> | Paused<T>;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    start: Done<T> | Paused<T>,
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
  get paused(): Paused<T> | Done<T> {
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
      return new Script(name, build, Paused.atStart(step));
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
    const step = (pick: PickFunction) => done(build(pick));
    return new Script(name, build, Paused.atStart(step));
  }

  static fromStep<T>(name: string, step: StepFunction<T>): Script<T> {
    const paused = Paused.atStart(step);
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
