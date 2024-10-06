import type { BuildFunction, Pickable } from "./pickable.ts";
import type { PlayoutSource } from "./backtracking.ts";
import type { GenPipe } from "./gen_class.ts";

import { PickRequest } from "./picks.ts";
import { Pruned } from "./backtracking.ts";
import { Gen } from "./gen_class.ts";
import { assert } from "@std/assert/assert";

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

/**
 * Picks an integer in the given range.
 *
 * A minimum implementation will just call next(), but it can also substitute a
 * different PickRequest, such as one with a narrower range.
 */
export type IntPickerMiddleware = (
  req: PickRequest,
  next: (req: PickRequest) => number,
) => number;

/**
 * Options for {@link PickFunction}.
 */
export type PickFunctionOpts<T> = {
  /**
   * A function that initializes middleware to respond to PickRequests.
   *
   * Multiple attempts may be needed to generate a value. The middle() function
   * will be called once before each attempt.
   */
  middle?: () => IntPickerMiddleware;

  /**
   * Filters the generated value.
   *
   * If it returns false, the pick function may either try a different value or
   * throw {@link Pruned}.
   */
  accept?: (val: T) => boolean;

  /**
   * The maximum number of times to try to generate a value when filtering.
   * (Default: 1000.)
   */
  maxTries?: number;
};

/**
 * Generates a value given a PickRequest, an Arbitrary, or some other PickSet.
 *
 * Throws {@link Pruned} if no value can be generated, perhaps due to filtering.
 */
export interface PickFunction {
  <T>(req: Pickable<T>, opts?: PickFunctionOpts<T>): T;
}

export type GenerateOpts = {
  /**
   * A limit on the number of picks to generate normally during a playout. It
   * can be used to limit the size of generated objects.
   *
   * Once the limit is reached, the {@link PickFunction} will always generate
   * the default value for any sub-objects being generated.
   */
  limit?: number;
};

export function makePickFunction<T>(
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): PickFunction {
  const limit = opts?.limit;
  const dispatch = <T>(
    arg: Pickable<T>,
    opts?: PickFunctionOpts<T>,
  ): T => {
    if (arg instanceof PickRequest) {
      let req: PickRequest = arg;
      if (limit !== undefined && playouts.depth >= limit) {
        req = new PickRequest(arg.min, arg.min);
      }
      const pick = playouts.nextPick(req);
      if (pick === undefined) throw new Pruned("cancelled in PlayoutSource");
      return pick as T;
    }

    if (arg === null || typeof arg !== "object") {
      throw new Error("pick function called with an invalid argument");
    }

    const script = Script.from(arg, { caller: "pick function" });

    const startMiddle = opts?.middle;
    const build = () => {
      while (true) {
        const depth = playouts.depth;
        try {
          let innerPick: PickFunction = dispatch;

          if (startMiddle !== undefined) {
            const middle = startMiddle();
            innerPick = function dispatchWithMiddleware<T>(
              req: Pickable<T>,
              opts?: PickFunctionOpts<T>,
            ) {
              if (req instanceof PickRequest) {
                return middle(req, dispatch) as T;
              } else {
                return dispatch(req, opts);
              }
            };
          }

          const val = script.buildPick(innerPick);
          return val;
        } catch (e) {
          if (!(e instanceof Pruned)) {
            throw e;
          }
          if (!playouts.startAt(depth)) {
            throw e; // can't recover
          }
        }
      }
    };

    const accept = opts?.accept;
    if (accept === undefined) {
      return build();
    }

    // filtered pick
    const maxTries = opts?.maxTries ?? 1000;
    for (let i = 0; i < maxTries; i++) {
      const depth = playouts.depth;
      const val = build();
      if (accept(val)) {
        return val;
      }
      if (!playouts.startAt(depth)) {
        throw new Pruned("accept() returned false for all possible values");
      }
    }
    throw new Error(
      `accept() returned false ${maxTries} times for ${script.name}; giving up`,
    );
  };
  return dispatch;
}

/**
 * Generates a value in a new playout.
 *
 * Returns undefined if it ran out of playouts without generating anything.
 */
export function generate<T>(
  arg: Pickable<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | undefined {
  const script = Script.from(arg, { caller: "generate" });
  if (!playouts.startAt(0)) {
    return undefined;
  }
  return generateValue(script, playouts, opts);
}

/**
 * Generates a value a the current depth, continuing the current playout if possible.
 *
 * Returns undefined if there are no more playouts available at the current depth.
 */
export function generateValue<T>(
  script: Script<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | undefined {
  if (script.toPipe() !== undefined) {
    return generateFromPipe(script, playouts);
  } else {
    return generateFromFunction(script, script.buildPick, playouts, opts);
  }
}

function generateFromFunction<T>(
  script: Script<T>,
  build: BuildFunction<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
) {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const pick = makePickFunction(playouts, opts);
      const val = build(pick);
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return Gen.fromBuildResult(script, reqs, replies, val);
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
      if (playouts.state === "picking") {
        playouts.endPlayout(); // pruned, move to next playout
      }
    }
  }
  return undefined;
}

function generateFromPipe<T, I>(
  script: Script<T>,
  playouts: PlayoutSource,
): Gen<T> | undefined {
  const depth = playouts.depth;
  const { base, steps } = script.toSteps();

  nextPlayout: while (playouts.startValue(depth)) {
    const first = generateFromFunction(base, base.buildPick, playouts);
    if (first === undefined) {
      continue;
    }

    let input = first;
    for (const script of steps) {
      const pipe = script.toPipe();
      assert(pipe !== undefined);
      const result = thenGenerate(script, { input, then: pipe.then }, playouts);
      if (result === undefined) {
        continue nextPlayout;
      }
      input = result;
    }

    return input as Gen<T>;
  }
}

export function thenGenerate<I, T>(
  script: Script<T>,
  pipe: GenPipe<I, T>,
  playouts: PlayoutSource,
): Gen<T> | undefined {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const pick = makePickFunction(playouts);
      const val = pipe.then(pipe.input.val, pick);
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return Gen.fromPipeResult(script, pipe, reqs, replies, val);
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
      if (playouts.state === "picking") {
        playouts.endPlayout(); // pruned, move to next playout
      }
    }
  }

  return undefined; // out of playouts at this depth
}
