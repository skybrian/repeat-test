import type { PickFunction } from "./build.ts";

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
 * A function that builds a value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * If the {@link PickFunction} throws {@link Pruned} then the build function
 * should also throw it to allow the function call to be retried. The build
 * function could also throw it to if it gets a pick it can't use.
 */
export type BuildFunction<T> = (pick: PickFunction) => T;

/**
 * Something that can generate picks.
 */
export type Pickable<T> = {
  readonly buildPick: BuildFunction<T>;
};
