import type { PickFunction } from "./build.ts";

/**
 * A function that builds a value, given some picks.
 *
 * The result should be deterministic, depending only on what `pick` returns.
 *
 * It may throw {@link Pruned} to indicate that the picks can't be used to
 * construct a value. (For example, due to filtering.)
 */
export type BuildFunction<T> = (pick: PickFunction) => T;

/**
 * Something that can generate picks.
 */
export type Pickable<T> = {
  readonly buildPick: BuildFunction<T>;
};
