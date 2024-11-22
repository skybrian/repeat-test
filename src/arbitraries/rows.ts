import type { ObjectShape } from "../pickable.ts";

import { scriptFromShape } from "../scripts/scriptFromShape.ts";
import { scriptFromCases } from "../scripts/scriptFromCases.ts";
import { Arbitrary } from "../arbitrary_class.ts";
import { assert } from "@std/assert/assert";

export type Row = Record<string, unknown>;

export type RowCase<T extends Row> = {
  readonly name: string;
  readonly weight: number;
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
  const c = Object.freeze({ name, weight: 1, shape });
  return new RowPicker([c], { name });
}

/**
 * Creates an Arbitrary that chooses between different object shapes.
 */
export function union<T extends Row>(
  ...cases: RowPicker<T>[]
): RowPicker<T> {
  const rowCases: RowCase<T>[] = [];
  for (const arb of cases) {
    const weight = arb.buildScript.opts.weight ?? 1;
    const childTotal = arb.cases.reduce((sum, c) => sum + c.weight, 0);
    assert(childTotal > 0, "child total must be positive");
    const adjustment = weight / childTotal;

    for (const c of arb.cases) {
      rowCases.push(Object.freeze({
        name: c.name,
        weight: c.weight * adjustment,
        shape: c.shape,
      }));
    }
  }

  return new RowPicker(rowCases, { name: "union" });
}

/**
 * An Arbitrary that generates objects from a list of possible shapes.
 */
export class RowPicker<T extends Row> extends Arbitrary<T> {
  constructor(
    readonly cases: RowCase<T>[],
    opts: { name: string; weight?: number },
  ) {
    if (cases.length === 0) {
      throw new Error("union must have at least one case");
    }

    if (cases.length === 1) {
      super(scriptFromShape(name, cases[0].shape).with(opts));
      return;
    }

    const build = scriptFromCases<T>(
      cases.map(({ name, weight, shape }) =>
        scriptFromShape(name, shape).with({ weight })
      ),
    );
    super(build.with(opts));
  }

  override with(opts: { name?: string; weight?: number }): RowPicker<T> {
    const name = opts?.name ?? this.name;
    const weight = opts?.weight ?? this.buildScript.opts.weight;
    return new RowPicker(this.cases, { name, weight });
  }
}
