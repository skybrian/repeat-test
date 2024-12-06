import type { ObjectShape } from "../scripts/scriptFromShape.ts";

import { scriptFromShape } from "../scripts/scriptFromShape.ts";
import { scriptFromCases } from "../scripts/scriptFromCases.ts";
import { Arbitrary } from "../arbitrary_class.ts";
import { assert } from "@std/assert/assert";

/**
 * An object that can serve as a row in a table.
 *
 * String-keyed properties may be used as columns.
 */
export type Row = Record<string, unknown>;

/**
 * Defines an Arbitrary that creates objects with the given shape.
 *
 * The objects will always have the same keys. The possible values for each key
 * are independent and generated using the corresponding Pickable. The prototype
 * will always be `Object.prototype`.
 */
export function object<T extends Row>(shape: ObjectShape<T>): ArbRow<T> {
  return ArbRow.object(shape);
}

/**
 * Defines an Arbitrary that chooses between different object shapes.
 */
export function union<T extends Row>(...cases: ArbRow<T>[]): ArbRow<T> {
  return ArbRow.union(...cases);
}

export type RowCase<T extends Row> = {
  readonly name: string;
  readonly weight: number;
  readonly shape: ObjectShape<T>;
};

/**
 * An Arbitrary that generates row objects that can be used in a table.
 */
export class ArbRow<T extends Row> extends Arbitrary<T> {
  #cases: RowCase<T>[];

  private constructor(
    cases: RowCase<T>[],
    opts: { name: string; weight?: number },
  ) {
    if (cases.length === 0) {
      throw new Error("union must have at least one case");
    }

    if (cases.length === 1) {
      super(scriptFromShape(name, cases[0].shape).with(opts));
      this.#cases = cases;
      return;
    }

    const build = scriptFromCases<T>(
      cases.map(({ name, weight, shape }) =>
        scriptFromShape(name, shape).with({ weight })
      ),
    );

    super(build.with(opts));
    this.#cases = cases;
  }

  /** Returns a copy with a different name or weight. */
  override with(opts: { name?: string; weight?: number }): ArbRow<T> {
    const name = opts?.name ?? this.name;
    const weight = opts?.weight ?? this.buildScript.opts.weight;
    return new ArbRow(this.#cases, { name, weight });
  }

  /**
   * Defines a RowArb that creates objects with a single shape.
   */
  static object<T extends Row>(shape: ObjectShape<T>): ArbRow<T> {
    const propCount = Object.keys(shape).length;
    const name = propCount === 0 ? "empty object" : "object";
    const c = Object.freeze({ name, weight: 1, shape });
    return new ArbRow([c], { name });
  }

  /**
   * Defines a RowArb that creates objects from multiple object shapes.
   */
  static union<T extends Row>(...cases: ArbRow<T>[]): ArbRow<T> {
    const rowCases: RowCase<T>[] = [];
    for (const arb of cases) {
      const weight = arb.buildScript.weight;
      const childTotal = arb.#cases.reduce((sum, c) => sum + c.weight, 0);
      assert(childTotal > 0, "child total must be positive");
      const adjustment = weight / childTotal;

      for (const c of arb.#cases) {
        rowCases.push(Object.freeze({
          name: c.name,
          weight: c.weight * adjustment,
          shape: c.shape,
        }));
      }
    }

    return new ArbRow(rowCases, { name: "union" });
  }

  /** Returns info about each shape that this ArbRow can generate. */
  private static casesFromArb<T extends Row>(row: ArbRow<T>): RowCase<T>[] {
    return row.#cases;
  }
}

export const casesFromArb = ArbRow["casesFromArb"];
