import { PickRequest } from "./picks.ts";
import { type PlayoutSource, Pruned } from "./backtracking.ts";

/**
 * A function that generates a value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link Pruned} to indicate that generation failed for the
 * current pick sequence. (For example, due to filtering.)
 */
export type PickCallback<T> = (pick: PickFunction) => T;

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
  readonly generateFrom: PickCallback<T>;
}

/**
 * Options for {@link PickFunction}.
 */
export type PickFunctionOpts<T> = {
  /**
   * Filters the generated value.
   *
   * If it returns false, the pick function may either try a different value or
   * throw {@link Pruned}.
   */
  accept?: (val: T) => boolean;
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
    const generateFrom = req["generateFrom"];
    if (typeof generateFrom === "function") {
      const generate = () => {
        while (true) {
          const depth = playouts.depth;
          try {
            const val = generateFrom(dispatch);
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
      while (true) {
        const depth = playouts.depth;
        const val = generate();
        if (accept(val)) {
          return val;
        }
        if (!playouts.startAt(depth)) {
          throw new Pruned("accept() returned false for all possible values");
        }
      }
    }
    throw new Error("pick function called with an invalid argument");
  };
  return dispatch;
}

/**
 * A generated value and the picks that were used to generate it.
 */
export type Generated<T> = {
  ok: true;
  reqs: PickRequest[];
  replies: number[];
  val: T;
};

/**
 * Generates a value by trying each playout one at a time, given a source of
 * playouts.
 *
 * Returns undefined if it ran out of playouts without generating anything.
 */
export function generate<T>(
  set: PickSet<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Generated<T> | undefined {
  while (playouts.startAt(0)) {
    try {
      const pick = makePickFunction(playouts, opts);
      const val = set.generateFrom(pick);
      const reqs = playouts.getRequests();
      const replies = playouts.getReplies();
      if (playouts.endPlayout()) {
        return { ok: true, reqs, replies, val };
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  }
}
