import { EditPicker, type IntEditor, PickRequest } from "./picks.ts";
import { onePlayout, type PlayoutSource, Pruned } from "./backtracking.ts";
import type { Success } from "./results.ts";

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
    const generateFrom = req["generateFrom"];
    if (typeof generateFrom === "function") {
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

            const val = generateFrom(innerPick);
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
    }
    throw new Error("pick function called with an invalid argument");
  };
  return dispatch;
}

export interface Playout {
  readonly reqs: PickRequest[];
  readonly replies: number[];
}

/**
 * A generated value and the picks that were used to generate it.
 */
export class Generated<T> implements Success<T> {
  /** Satisfies the Success interface. */
  readonly ok = true;

  /**
   * Creates a Generated value with the given contents.
   */
  constructor(
    private readonly set: PickSet<T>,
    readonly reqs: PickRequest[],
    readonly replies: number[],
    readonly val: T,
  ) {}

  /**
   * Regenerates the value after editing its picks.
   * @returns the new value, or undefined if no change is available.
   */
  mutate(editor: IntEditor): Generated<T> | undefined {
    const picker = new EditPicker(this.replies, editor);
    const gen = generate(this.set, onePlayout(picker));
    if (picker.edits === 0 && picker.deletes === 0) {
      return undefined; // no change
    }
    return gen;
  }
}

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
        return new Generated(set, reqs, replies, val);
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  }
  return undefined;
}
