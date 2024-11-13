import type { Pickable, PickFunction, PickFunctionOpts } from "./pickable.ts";
import type { IntPicker, Range } from "./picks.ts";
import type { Script } from "./script_class.ts";

import { Filtered } from "./pickable.ts";
import { PickRequest } from "./picks.ts";
import { scriptFrom } from "./scripts/scriptFrom.ts";

export interface PickResponder {
  /** Attempts to start a new playout, continuing at the given depth. */
  startAt(depth: number): boolean;

  /** Returns undefined if the current playout is filtered out. */
  nextPick(req: PickRequest): number | undefined;

  get depth(): number;
}

/** A non-backtracking responder that takes picks from an IntPicker. */
export function responderFromPicker(wrapped: IntPicker): PickResponder {
  let depth = 0;

  return {
    startAt(newDepth: number): boolean {
      // can't backtrack; no alternative picks available
      return newDepth === depth;
    },
    nextPick(req: PickRequest): number {
      const reply = wrapped.pick(req);
      depth++;
      return reply;
    },
    get depth(): number {
      return depth;
    },
  };
}

export function usePicker(picker: IntPicker): PickFunction {
  return makePickFunction(responderFromPicker(picker));
}

/** Creates a simple, non-backtracking pick source. */
export function responderFromReplies(replies: number[]): PickResponder {
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
  return makePickFunction(responderFromReplies(replies));
}

/**
 * A destination for recording picks made via a pick function.
 */
export interface PickLogger {
  /**
   * Pushes a pick used by a script to the buffer. It might be removed later
   * using {@link undoPushes}.
   */
  push(req: Range, pick: number): void;

  /** Pops the given number of picks from the buffer. */
  undoPushes(count: number): void;
}

/**
 * A destination for recording top-level calls made via a pick function.
 */
export interface CallLogger {
  /** Ends a top-level pick request. Uses one pushed pick. */
  endPick(): void;

  /** Ends a top-level script call. This uses any pushed picks since the previous call. */
  endScript<T>(arg: Script<T>, result: T): void;
}

export type MakePickFunctionOpts = {
  /**
   * A limit on the number of picks to generate normally during a playout. It
   * can be used to limit the size of generated objects.
   *
   * Once the limit is reached, the {@link PickFunction} will always generate
   * the default value for any sub-objects being generated.
   */
  limit?: number;

  /**
   * If set, picks will be recorded to this log.
   */
  logPicks?: PickLogger;

  /**
   * If set, calls will be recorded to the log.
   */
  logCalls?: CallLogger;
};

export function makePickFunction<T>(
  playouts: PickResponder,
  opts?: MakePickFunctionOpts,
): PickFunction {
  const limit = opts?.limit;

  const logPicks = opts?.logPicks;
  const logCalls = opts?.logCalls;
  let level = logCalls ? 0 : 1;
  let pickCount = 0;

  /** Builds a script, retrying if it throws Filtered. */
  function retry<T>(script: Script<T>, pick: PickFunction): T {
    while (true) {
      const depth = playouts.depth;
      const start = pickCount;
      level++;
      try {
        return script.directBuild(pick);
      } catch (e) {
        logPicks?.undoPushes(pickCount - start);
        pickCount = start;

        if (!(e instanceof Filtered)) {
          throw e;
        }
        if (!playouts.startAt(depth)) {
          throw e; // can't recover
        }
      } finally {
        level--;
      }
    }
  }

  function dispatch<T>(arg: Pickable<T>, opts?: PickFunctionOpts<T>): T {
    if (arg instanceof PickRequest) {
      let req: PickRequest = arg;
      if (limit !== undefined && playouts.depth >= limit) {
        req = new PickRequest(arg.min, arg.min);
      }
      const pick = playouts.nextPick(req);
      if (pick === undefined) throw new Filtered("cancelled in PlayoutSource");
      logPicks?.push(req, pick);
      if (level === 0) {
        logCalls?.endPick();
      }
      pickCount++;
      return pick as T;
    }

    const script = scriptFrom(arg, { caller: "pick function" });

    const accept = opts?.accept;
    if (accept === undefined) {
      const val = retry(script, dispatch);
      if (level == 0) {
        logCalls?.endScript(script, val);
      }
      return val;
    }

    // filtered pick
    const maxTries = opts?.maxTries ?? 1000;
    for (let i = 0; i < maxTries; i++) {
      const depth = playouts.depth;

      const start = pickCount;
      const val = retry(script, dispatch);
      if (accept(val)) {
        if (level == 0) {
          logCalls?.endScript(script, val);
        }
        return val;
      }
      logPicks?.undoPushes(pickCount - start);
      pickCount = start;

      if (!playouts.startAt(depth)) {
        throw new Filtered("accept() returned false for all possible values");
      }
    }
    throw new Error(
      `accept() returned false ${maxTries} times for ${script.name}; giving up`,
    );
  }

  return dispatch;
}
