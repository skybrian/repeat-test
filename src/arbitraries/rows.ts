import type { ObjectShape, RowMaker } from "@/arbitrary.ts";

import { Arbitrary } from "@/arbitrary.ts";

/**
 * An Arbitrary that generates objects with the given properties.
 *
 * (The prototype is always `Object.prototype`.)
 */
export function object<T extends Record<string, unknown>>(
  shape: ObjectShape<T>,
): RowMaker<T> {
  return Arbitrary.object(shape);
}
