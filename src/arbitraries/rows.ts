import type { ObjectShape } from "../pickable.ts";

import { scriptFromShape } from "../scripts/scriptFromShape.ts";
import { scriptFromCases } from "../scripts/scriptFromCases.ts";
import { Arbitrary } from "../arbitrary_class.ts";

export type Row = Record<string, unknown>;

export type RowCase<T extends Row> = {
  readonly name: string;
  readonly shape: ObjectShape<T>;
};

/**
 * Creates an Arbitrary that generates objects that all have the same shape.
 *
 * That is, the property keys are fixed, and the value for each key is generated
 * by a given Pickable.
 *
 * (The prototype is always `Object.prototype`.)
 */
export function object<T extends Row>(
  shape: ObjectShape<T>,
): RowPicker<T> {
  const propCount = Object.keys(shape).length;
  const name = propCount === 0 ? "empty object" : "object";
  const c = Object.freeze({ name, shape });
  return new RowPicker(name, [c]);
}

/**
 * Creates an Arbitrary that chooses between different object shapes.
 */
export function union<T extends Row>(
  ...cases: RowPicker<T>[]
): RowPicker<T> {
  const rowCases = cases.map((arb) => arb.cases).flat();
  return new RowPicker("union", rowCases);
}

/**
 * An Arbitrary that generates objects from a list of possible shapes.
 */
export class RowPicker<T extends Row> extends Arbitrary<T> {
  constructor(name: string, readonly cases: RowCase<T>[]) {
    if (cases.length === 0) {
      throw new Error("union must have at least one case");
    }

    if (cases.length === 1) {
      super(scriptFromShape(name, cases[0].shape));
      return;
    }

    const build = scriptFromCases<T>(
      cases.map(({ name, shape }) => scriptFromShape(name, shape)),
    );
    super(build.with({ name }));
  }

  override with(opts: { name: string }): RowPicker<T> {
    return new RowPicker(opts.name, this.cases);
  }
}
