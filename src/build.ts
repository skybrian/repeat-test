import type {
  BuildFunction,
  Pickable,
  PickFunction,
  PickFunctionOpts,
} from "./pickable.ts";
import type { PlayoutSource } from "./backtracking.ts";
import type { PipeRequest } from "./gen_class.ts";

import { assert } from "@std/assert/assert";
import { Pruned } from "./pickable.ts";
import { PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";
import { Gen } from "./gen_class.ts";

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
 * Creates a request that will be executed with Middleware.
 */
export class MiddlewareRequest<T> implements Pickable<T> {
  private constructor(
    readonly script: Script<T>,
    readonly startMiddle: () => IntPickerMiddleware,
  ) {}

  get buildPick(): BuildFunction<T> {
    return () => {
      throw new Error(
        "MiddlewareRequest.buildPick() called; should have been intercepted",
      );
    };
  }

  static wrap<T>(
    pickable: Pickable<T>,
    startMiddle: () => IntPickerMiddleware,
  ): MiddlewareRequest<T> {
    return new MiddlewareRequest(Script.from(pickable), startMiddle);
  }
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
    let startMiddle: (() => IntPickerMiddleware) | undefined;

    if (arg instanceof PickRequest) {
      let req: PickRequest = arg;
      if (limit !== undefined && playouts.depth >= limit) {
        req = new PickRequest(arg.min, arg.min);
      }
      const pick = playouts.nextPick(req);
      if (pick === undefined) throw new Pruned("cancelled in PlayoutSource");
      return pick as T;
    } else if (arg instanceof MiddlewareRequest) {
      startMiddle = arg.startMiddle;
      arg = arg.script;
    }

    if (arg === null || typeof arg !== "object") {
      throw new Error("pick function called with an invalid argument");
    }

    const script = Script.from(arg, { caller: "pick function" });

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
export function generateValue<T, I>(
  script: Script<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Gen<T> | undefined {
  const depth = playouts.depth;
  const pick = makePickFunction(playouts, opts);
  const { base, steps } = script.toSteps();

  nextPlayout: while (playouts.startValue(depth)) {
    const first = generateFromFunction(base, base.buildPick, pick, playouts);
    if (first === undefined) {
      continue;
    }

    let input = first;
    for (const script of steps) {
      const pipe = script.toPipe();
      assert(pipe !== undefined);
      const request = { script, input, then: pipe.then };
      const result = thenGenerate(request, pick, playouts);
      if (result === undefined) {
        continue nextPlayout;
      }
      input = result;
    }

    return input as Gen<T>;
  }
}

function generateFromFunction<T>(
  script: Script<T>,
  build: BuildFunction<T>,
  pick: PickFunction,
  playouts: PlayoutSource,
) {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const val = build(pick);
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return Gen.makeBuildResult(script, reqs, replies, val);
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

export function thenGenerate<I, T>(
  pipeReq: PipeRequest<I, T>,
  pick: PickFunction,
  playouts: PlayoutSource,
): Gen<T> | undefined {
  const depth = playouts.depth;
  while (playouts.startValue(depth)) {
    try {
      const val = pipeReq.then(pipeReq.input.val, pick);
      const reqs = playouts.getRequests(depth);
      const replies = playouts.getReplies(depth);
      return Gen.makePipeResult(pipeReq, reqs, replies, val);
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
