import type { ObjectShape } from "../pickable.ts";

import { Arbitrary } from "../arbitrary_class.ts";
import { Script } from "../script_class.ts";

export type Row = Record<string, unknown>;

/**
 * An Arbitrary that generates objects with the given properties.
 *
 * (The prototype is always `Object.prototype`.)
 */
export function object<T extends Row>(
  shape: ObjectShape<T>,
): ObjectArb<T> {
  const propCount = Object.keys(shape).length;
  const name = propCount === 0 ? "empty object" : "object";
  return new ObjectArb(name, shape);
}

/**
 * An Arbitrary that generates objects with the given properties.
 */
export class ObjectArb<T extends Row> extends Arbitrary<T> {
  constructor(name: string, readonly shape: ObjectShape<T>) {
    super(Script.object(name, shape));
  }
}
