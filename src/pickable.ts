/**
 * Indicates that no pick could be built and a retry is needed.
 *
 * A `PickFunction` may throw `Pruned` to indicate that no pick could be
 * generated and a retry is needed. This can happen if due to filtering.
 */
export class Pruned extends Error {
  readonly ok = false;
  constructor(msg: string) {
    super(msg);
  }
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

  /**
   * The maximum number of times to try to generate a value when filtering.
   * (Default: 1000.)
   */
  maxTries?: number;
};

/**
 * Generates a value, given a Pickable.
 *
 * Throws {@link Pruned} if no value can be generated, perhaps due to filtering.
 */
export interface PickFunction {
  <T>(req: Pickable<T>, opts?: PickFunctionOpts<T>): T;
}

/**
 * A deterministic function from a source of picks to a value.
 *
 * The result should only on what `pick` returns.
 *
 * If the {@link PickFunction} throws {@link Pruned} then the build function
 * should also throw it. This allow the function call to be retried. The build
 * function could also throw it to if it gets a pick it can't use.
 */
export type BuildFunction<T> = (pick: PickFunction) => T;

/**
 * Something that can generate picks.
 *
 * Alternatively, a set of possible values to pick from.
 */
export type Pickable<T> = {
  /** Builds a value from the given source of picks. */
  readonly buildFrom: BuildFunction<T>;
};
