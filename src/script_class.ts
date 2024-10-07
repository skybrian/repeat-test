import type { BuildFunction, Pickable, PickFunction } from "./pickable.ts";

/**
 * A function that transforms a value, given some picks.
 *
 * It may throw {@link Pruned} to indicate that the picks can't be used to
 * transform a value. (For example, due to filtering.)
 */
export type ThenFunction<In, Out> = (input: In, pick: PickFunction) => Out;

export type Pipe<Out, Inner> = {
  input: Script<Inner>;
  then: ThenFunction<Inner, Out>;
};

export interface HasScript<T> extends Pickable<T> {
  /** Generates a member of this set, given a source of picks. */
  readonly buildScript: Script<T>;
}

export class Script<T> implements Pickable<T> {
  readonly #name: string;
  readonly #build: BuildFunction<T>;
  readonly #pipe: Pipe<T, unknown> | undefined;

  private constructor(
    name: string,
    build: BuildFunction<T>,
    pipe: Pipe<T, unknown> | undefined,
  ) {
    this.#name = name;
    this.#build = build;
    this.#pipe = pipe;
  }

  get name(): string {
    return this.#name;
  }

  toPipe(): Pipe<T, unknown> | undefined {
    return this.#pipe;
  }

  toSteps(): {
    base: Script<unknown>;
    steps: Script<unknown>[];
  } {
    return Script.makeSteps(this);
  }

  get buildPick(): BuildFunction<T> {
    return this.#build;
  }

  with(opts: { name: string }): Script<T> {
    return new Script(opts.name, this.#build, this.#pipe);
  }

  then<Out>(name: string, then: ThenFunction<T, Out>): Script<Out> {
    return Script.makePipeline(name, this, then);
  }

  static make<T>(
    name: string,
    build: BuildFunction<T>,
  ): Script<T> {
    return new Script(name, build, undefined);
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
      typeof arg.buildPick !== "function"
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
      return Script.make("untitled", arg.buildPick);
    }
  }

  private static makeSteps(script: Script<unknown>): {
    base: Script<unknown>;
    steps: Script<unknown>[];
  } {
    if (script.#pipe === undefined) {
      return { base: script, steps: [] };
    }

    const steps: Script<unknown>[] = [];
    let current: Script<unknown> = script;
    while (current.#pipe !== undefined) {
      steps.push(current);
      current = current.#pipe.input;
    }

    steps.reverse();
    return { base: current, steps };
  }

  private static makePipeline<In, Out>(
    name: string,
    input: Script<In>,
    then: ThenFunction<In, Out>,
  ): Script<Out> {
    const build = (pick: PickFunction): Out => {
      const inner = input.buildPick(pick);
      return then(inner, pick);
    };

    const step = {
      input,
      then,
    } as Pipe<Out, unknown>;

    return new Script(name, build, step);
  }
}