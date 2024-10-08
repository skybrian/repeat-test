import type {
  BuildFunction,
  Pickable,
  PickFunction,
  PickFunctionOpts,
} from "./pickable.ts";
import type { PlayoutSource } from "./backtracking.ts";

import { Pruned } from "./pickable.ts";
import { PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";

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

  get buildFrom(): BuildFunction<T> {
    return () => {
      throw new Error(
        "MiddlewareRequest.buildFrom() called; should have been intercepted",
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

          const val = script.buildFrom(innerPick);
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
