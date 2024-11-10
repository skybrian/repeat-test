import type { ObjectShape } from "../pickable.ts";

import { Arbitrary } from "../arbitrary_class.ts";
import { Script } from "../script_class.ts";

/**
 * An Arbitrary that's suitable for generating rows for a table.
 */
export class RowMaker<T extends Record<string, unknown>> extends Arbitrary<T> {
  readonly #shape: ObjectShape<T>;

  constructor(name: string, shape: ObjectShape<T>) {
    super(Script.object(name, shape));
    this.#shape = shape;
  }

  /** Returns the Pickable for each property. */
  get shape(): ObjectShape<T> {
    return this.#shape;
  }
}

/**
 * An Arbitrary that generates objects with the given properties.
 *
 * (The prototype is always `Object.prototype`.)
 */
export function object<T extends Record<string, unknown>>(
  shape: ObjectShape<T>,
): RowMaker<T> {
  const propCount = Object.keys(shape).length;
  const name = propCount === 0 ? "empty object" : "object";
  return new RowMaker(name, shape);
}
