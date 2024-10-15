import type {
  BuildFunction,
  Pickable,
  PickFunction,
  PickFunctionOpts,
} from "./pickable.ts";

import type { Range } from "./picks.ts";

import { Filtered } from "./pickable.ts";
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

/**
 * A destination for recording picks and top-level calls to the pick function.
 */
export interface CallSink {
  /**
   * The number of picks pushed since the last call to {@link pushScript}.
   *
   * May be set to a lower value that's >= 0.
   */
  nextCallPicks: number;

  /** Logs a PickRequest call. */
  pushPick(level: number, req: Range, pick: number): void;

  /** Logs a script call. */
  pushScript<T>(level: number, arg: Script<T>, result: T): void;
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

  /**
   * If set, top-level calls to pick() will be recorded to this log.
   */
  log?: CallSink;
};

export interface PickResponder {
  /** Attempts to start a new playout, continuing at the given depth. */
  startAt(depth: number): boolean;

  /** Returns undefined if the current playout is filtered out. */
  nextPick(req: PickRequest): number | undefined;

  get depth(): number;
}

/** Creates a simple, non-backtracking pick source. */
export function playbackResponder(replies: number[]): PickResponder {
  let depth = 0;

  return {
    startAt(newDepth: number): boolean {
      // can't backtrack; no alternative picks available
      return newDepth === depth;
    },
    nextPick(req: PickRequest): number | undefined {
      if (depth >= replies.length) {
        depth++; // prevent backtracking
        return req.min;
      }
      const pick = replies[depth++];
      if (pick < req.min || pick > req.max) {
        return undefined; // filtered out
      }
      return pick;
    },
    get depth(): number {
      return depth;
    },
  };
}

/**
 * Creates a pick function that plays a single pick sequence.
 */
export function usePicks(...replies: number[]): PickFunction {
  return makePickFunction(playbackResponder(replies));
}

export function makePickFunction<T>(
  playouts: PickResponder,
  opts?: GenerateOpts,
): PickFunction {
  const limit = opts?.limit;

  const log = opts?.log;
  let level = 0;

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
      if (pick === undefined) throw new Filtered("cancelled in PlayoutSource");
      log?.pushPick(level, req, pick);
      return pick as T;
    }

    let startMiddle: (() => IntPickerMiddleware) | undefined;
    if (arg instanceof MiddlewareRequest) {
      startMiddle = arg.startMiddle;
      arg = arg.script;
    }

    const script = Script.from(arg, { caller: "pick function" });

    const build = () => {
      while (true) {
        const depth = playouts.depth;
        const saved = log?.nextCallPicks ?? 0;
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
          if (!(e instanceof Filtered)) {
            throw e;
          }
          if (!playouts.startAt(depth)) {
            throw e; // can't recover
          }
          if (log) {
            log.nextCallPicks = saved;
          }
        }
      }
    };

    const accept = opts?.accept;
    if (accept === undefined) {
      level++;
      const val = build();
      level--;
      log?.pushScript(level, script, val);
      return val;
    }

    // filtered pick
    const maxTries = opts?.maxTries ?? 1000;
    for (let i = 0; i < maxTries; i++) {
      const depth = playouts.depth;

      const saved = log?.nextCallPicks ?? 0;
      level++;
      const val = build();
      level--;
      if (accept(val)) {
        log?.pushScript(level, script, val);
        return val;
      }
      if (log) {
        log.nextCallPicks = saved;
      }

      if (!playouts.startAt(depth)) {
        throw new Filtered("accept() returned false for all possible values");
      }
    }
    throw new Error(
      `accept() returned false ${maxTries} times for ${script.name}; giving up`,
    );
  };
  return dispatch;
}
