/**
 * Indicates that a value can't be built from the chosen picks.
 *
 * The build function should be retried if different picks are available.
 */
export class Filtered extends Error {
  /** Creates an error with the given message. */
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * Options for {@link PickFunction}.
 */
export type PickFunctionOpts<T> = {
  /**
   * Filters values generated within a call to a pick function.
   *
   * If it returns false, the pick function may either try a different value or
   * give up and throw {@link Filtered}.
   */
  accept?: (val: T) => boolean;

  /**
   * A hint about how many times to try to generate a value before giving up.
   * (Default: 1000.)
   */
  maxTries?: number;
};

/**
 * Generates a value, given a Pickable.
 *
 * A pick function's implementation may call {@link Pickable.directBuild} any
 * number of times. (It might be zero times due to caching.)
 *
 * If no value can be generated, it will throw {@link Filtered}.
 */
export interface PickFunction {
  <T>(req: Pickable<T>, opts?: PickFunctionOpts<T>): T;
}

/**
 * A deterministic function from a sequence of picks to a value.
 *
 * A BuildFunction will be called with a *pick* function as its argument. It may
 * call *pick* any number of times, but these calls must be deterministic,
 * depending only on what *pick* returned previously. (So, when it calls *pick*
 * the first time, it should always pass in the same arguments.)
 *
 * When a BuildFunction is called twice and it receives the same picks, it
 * should build equivalent values. But these values don't need to be identical;
 * it could instead build an equivalent copy, which is less confusing when the
 * built value is mutable.
 *
 * When a BuildFunction returns a value that satisfies `Object.isFrozen,` the
 * value might be cached. Otherwise, it's assumed to be mutable and will be
 * rebuilt each time.
 *
 * When *pick* throws {@link Filtered}, a BuildFunction should also throw it.
 * This allows the build to be retried in an outer loop.
 *
 * A BuildFunction may also throw `Filtered` itself if *pick* returns a value it
 * can't use and another value might work.
 */
export type BuildFunction<T> = (pick: PickFunction) => T;

/**
 * Something that can build values from picks.
 *
 * Alternatively, a set of possible values to pick from.
 */
export type Pickable<T> = {
  /**
   * Builds a value from the given source of picks.
   *
   * Calling `something.directBuild(pick)` and `pick(something)` should be
   * usually be equivalent, except that *pick* may cache values or automatically
   * retry, so performance will be different.
   */
  directBuild(pick: PickFunction): T;
};

/**
 * Specifies the properties of an object to be generated.
 */
export type ObjectShape<T extends Record<string, unknown>> = {
  [K in keyof T]: Pickable<T[K]>;
};
