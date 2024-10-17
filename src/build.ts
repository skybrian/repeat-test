import type { Pickable, PickFunction, PickFunctionOpts } from "./pickable.ts";

import type { Range } from "./picks.ts";

import { Filtered } from "./pickable.ts";
import { PickRequest } from "./picks.ts";
import { Script } from "./script_class.ts";

/**
 * A destination for recording picks and top-level calls to the pick function.
 */
export interface CallSink {
  /**
   * Pushes an uncommited pick to the buffer. It might be removed later
   * using {@link popPicks}.
   */
  pushPick(req: Range, pick: number): void;

  /** Pops the given number of picks from the buffer. */
  popPicks(count: number): void;

  /** Ends a top-level pick request. */
  endPickCall(): void;

  /** Logs the result of a top-level call that's not a pick request. */
  endScriptCall<T>(arg: Script<T>, result: T): void;
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
  let pickCount = 0;

  /** Builds a script, retrying if it throws Filtered. */
  function retryScript<T>(script: Script<T>, pick: PickFunction): T {
    while (true) {
      const depth = playouts.depth;
      const before = pickCount;
      level++;
      try {
        return script.buildFrom(pick);
      } catch (e) {
        log?.popPicks(pickCount - before);
        pickCount = before;

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
      log?.pushPick(req, pick);
      pickCount++;
      if (level === 0) {
        log?.endPickCall();
      }
      return pick as T;
    }

    const script = Script.from(arg, { caller: "pick function" });

    const accept = opts?.accept;
    if (accept === undefined) {
      const val = retryScript(script, dispatch);
      if (level == 0) {
        log?.endScriptCall(script, val);
      }
      return val;
    }

    // filtered pick
    const maxTries = opts?.maxTries ?? 1000;
    for (let i = 0; i < maxTries; i++) {
      const depth = playouts.depth;

      const before = pickCount;
      const val = retryScript(script, dispatch);
      if (accept(val)) {
        if (level == 0) {
          log?.endScriptCall(script, val);
        }
        return val;
      }
      log?.popPicks(pickCount - before);
      pickCount = before;

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
