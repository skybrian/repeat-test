import { PickList, PickRequest } from "./picks.ts";
import { PlayoutPicker, Pruned } from "./backtracking.ts";

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

export type PickFunctionOpts<T> = {
  /**
   * A callback function that filters values after they're generated.
   *
   * (The second argument is used by the Jar class to filter out duplicates.)
   */
  accept?: (val: T, picks: PickList) => boolean;
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
  picker: PlayoutPicker,
  opts?: GenerateOpts,
): PickFunction {
  const limit = opts?.limit ?? 1000;
  const dispatch = <T>(
    req: PickRequest | PickSet<T>,
    opts?: PickFunctionOpts<T>,
  ): number | T => {
    if (req instanceof PickRequest) {
      if (picker.depth >= limit) {
        req = new PickRequest(req.min, req.min);
      }
      const pick = picker.maybePick(req);
      if (!pick.ok) throw new Pruned(pick.message);
      return pick.val;
    }
    const generateFrom = req["generateFrom"];
    if (typeof generateFrom === "function") {
      const generate = () => {
        while (true) {
          const depth = picker.depth;
          try {
            const val = generateFrom(dispatch);
            return val;
          } catch (e) {
            if (!(e instanceof Pruned)) {
              throw e;
            }
            if (!picker.startAt(depth)) {
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
        const depth = picker.depth;
        const depthBefore = picker.depth;
        const val = generate();
        const picks = picker.getPicks(depthBefore);
        if (accept(val, picks)) {
          return val;
        }
        if (!picker.startAt(depth)) {
          throw new Pruned("accept() returned false for all possible values");
        }
      }
    }
    throw new Error("pick function called with an invalid argument");
  };
  return dispatch;
}
