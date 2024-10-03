import type { PlayoutSource } from "./backtracking.ts";

import { PickRequest } from "./picks.ts";
import { Pruned } from "./backtracking.ts";
import { Gen } from "./gen_class.ts";

/**
 * A function that builds a value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link Pruned} to indicate that the picks can't be used to
 * construct a value. (For example, due to filtering.)
 */
export type BuildFunction<T> = (pick: PickFunction) => T;

/**
 * A function that transforms a value, given some picks.
 *
 * It may throw {@link Pruned} to indicate that the picks can't be used to
 * transform a value. (For example, due to filtering.)
 */
export type ThenFunction<In, Out> = (input: In, pick: PickFunction) => Out;

export type BuildStep<Out, Local> = {
  input: Script<Local>;
  then: ThenFunction<Local, Out>;
};

export interface Script<T> {
  readonly name: string;
  split(): BuildFunction<T> | BuildStep<T, unknown>;
  build(pick: PickFunction): T;
  with(opts: { name: string }): Script<T>;
  then<Out>(name: string, then: ThenFunction<T, Out>): Script<Out>;
}

export function makeScript<T>(
  name: string,
  build: BuildFunction<T>,
): Script<T> {
  const script = {
    get name() {
      return name;
    },
    split: () => build,
    get build() {
      return build;
    },
    then: <Out>(
      name: string,
      then: ThenFunction<T, Out>,
    ): Script<Out> => makePipeline<T, Out>(name, script, then),
    with(opts: { name: string }): Script<T> {
      return makeScript(opts.name, build);
    },
  };

  return script;
}

function makePipeline<Inner, Out>(
  name: string,
  input: Script<Inner>,
  then: ThenFunction<Inner, Out>,
): Script<Out> {
  const script = {
    get name() {
      return name;
    },
    split() {
      return { input, then } as BuildStep<Out, unknown>;
    },
    build(pick: PickFunction): Out {
      const next = input.build(pick);
      return then(next, pick);
    },
    then: <NextOut>(
      name: string,
      then: ThenFunction<Out, NextOut>,
    ): Script<NextOut> => makePipeline<Out, NextOut>(name, script, then),
    with(opts: { name: string }): Script<Out> {
      return makePipeline(opts.name, input, then);
    },
  };
  return script;
}

export function isBuildScript(x: unknown): x is Script<unknown> {
  if (typeof x !== "object" || x === null) {
    return false;
  }
  return "name" in x && "split" in x && "build" in x;
}

/**
 * A set of possible values that may be generated.
 *
 * (Or perhaps a multiset. PickSets may generate the same value in more than one
 * way.)
 */
export interface PickSet<T> {
  /** A short label to use in error messsages about this PickSet */
  readonly label: string;
  /** Generates a member of this set, given a source of picks. */
  readonly buildScript: Script<T>;
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
  (req: PickRequest): number;
  <T>(req: PickSet<T>, opts?: PickFunctionOpts<T>): T;
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
    req: PickRequest | PickSet<T>,
    opts?: PickFunctionOpts<T>,
  ): number | T => {
    if (req instanceof PickRequest) {
      if (limit !== undefined && playouts.depth >= limit) {
        req = new PickRequest(req.min, req.min);
      }
      const pick = playouts.nextPick(req);
      if (pick === undefined) throw new Pruned("cancelled in PlayoutSource");
      return pick;
    }
    const script = req["buildScript"];
    if (script === null || typeof script !== "object") {
      throw new Error("pick function called with an invalid argument");
    }
    const build = script["build"];
    if (typeof build !== "function") {
      throw new Error("pick function called with an invalid argument");
    }

    const startMiddle = opts?.middle;
    const generate = () => {
      while (true) {
        const depth = playouts.depth;
        try {
          let innerPick: PickFunction = dispatch;

          if (startMiddle !== undefined) {
            const middle = startMiddle();
            innerPick = function dispatchWithMiddleware<T>(
              req: PickRequest | PickSet<T>,
              opts?: PickFunctionOpts<T>,
            ) {
              if (req instanceof PickRequest) {
                return middle(req, dispatch);
              } else {
                return dispatch(req, opts);
              }
            };
          }

          const val = build(innerPick);
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
      return generate();
    }

    // filtered pick
    const maxTries = opts?.maxTries ?? 1000;
    for (let i = 0; i < maxTries; i++) {
      const depth = playouts.depth;
      const val = generate();
      if (accept(val)) {
        return val;
      }
      if (!playouts.startAt(depth)) {
        throw new Pruned("accept() returned false for all possible values");
      }
    }
    throw new Error(
      `accept() returned false ${maxTries} times for ${req.label}; giving up`,
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
  script: Script<T> | PickSet<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | undefined {
  if ("buildScript" in script) {
    script = script.buildScript;
  }
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
  const inner = script.split();
  if (!(typeof inner === "function")) {
    return generateFromBuildStep(script, inner, playouts);
  }

  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const pick = makePickFunction(playouts, opts);
      const val = inner(pick);
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

function generateFromBuildStep<T, I>(
  script: Script<T>,
  step: BuildStep<T, I>,
  playouts: PlayoutSource,
): Gen<T> | undefined {
  const input = generateValue(step.input, playouts);
  if (input === undefined) {
    return undefined;
  }

  const then = step.then;

  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const pick = makePickFunction(playouts);
      const val = then(input.val, pick);
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return Gen.fromBuildStepResult(script, input, reqs, replies, val);
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
