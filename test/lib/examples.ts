import { take } from "../../src/ordered.ts";
import type { Pickable } from "../../src/pickable.ts";
import { scriptFrom } from "../../src/scripts/scriptFrom.ts";

/**
 * Generates all examples from this Arbitrary, provided that it's not too many.
 *
 * @param opts.limit The maximum size of the array to return.
 *
 * There may be duplicates.
 */
export function takeAll<T>(
  arg: Pickable<T>,
  opts?: { limit?: number },
): T[] {
  const script = scriptFrom(arg);
  const limit = opts?.limit ?? 1000;

  const examples = take(script, limit + 1);
  if ((examples.length > limit)) {
    throw new Error(
      `takeAll for '${script.name}': array would have more than ${limit} elements`,
    );
  }
  return examples;
}
