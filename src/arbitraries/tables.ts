import type {
  Arbitrary,
  PickFunction,
  RowPicker,
  RowShape,
} from "@/arbitrary.ts";
import type { ArrayOpts } from "../options.ts";

import { assert } from "@std/assert/assert";
import { Domain, Jar } from "@/domain.ts";
import { PickRequest } from "../picks.ts";
import { parseArrayOpts } from "../options.ts";
import { generateAll } from "../ordered.ts";
import { PickTree } from "../pick_tree.ts";
import { arrayLengthBiases } from "../math.ts";
import { Script } from "../script_class.ts";

import * as arb from "./basics.ts";
import { RowJar } from "../jar_class.ts";

/**
 * Defines an Arbitrary that generates an array by taking distinct values from a
 * Domain.
 *
 * (The comparison is done using the canonical pick sequence for each value.)
 */
export function uniqueArray<T>(
  item: Domain<T>,
  opts?: ArrayOpts,
): Arbitrary<T[]> {
  const { min, max } = parseArrayOpts(opts);

  const startRegionSize = 20;
  const [startBias, extendedBias] = arrayLengthBiases(max - min, {
    startRegionSize,
  });

  const startCoin = arb.biased(startBias);
  const extendedCoin = arb.biased(extendedBias);

  function wantItem(i: number, pick: PickFunction): boolean {
    if ((i - min) < startRegionSize) {
      return pick(startCoin);
    } else {
      return pick(extendedCoin);
    }
  }

  return arb.from(function uniqueArrayCallback(pick) {
    const jar = new Jar(item);
    const out: T[] = [];
    while (out.length < min) {
      if (jar.isEmpty()) {
        throw new Error(
          `not enough unique values; want length.min <= ${out.length}, got: ${min}`,
        );
      }
      out.push(jar.takeAny(pick));
    }
    while (out.length < max) {
      if (jar.isEmpty()) {
        // Add an ending pick to match a regular array.
        pick(new PickRequest(0, 0));
        return out;
      } else if (!wantItem(out.length, pick)) {
        return out;
      }
      out.push(jar.takeAny(pick));
    }
    return out;
  }).with({ name: "uniqueArray" });
}

function countDistinct(dom: Domain<unknown>, max: number): number {
  if (max === 0) {
    return 0;
  }
  const remaining = new PickTree();
  let count = 0;
  for (const gen of generateAll(dom)) {
    const regen = dom.regenerate(gen.val);
    assert(regen.ok);
    if (remaining.prune(regen)) {
      count++;
      if (count >= max) {
        return max;
      }
    }
  }
  return count;
}

/**
 * Constraints used when generating or validating tables.
 */
export type TableOpts<T extends Record<string, unknown>> = ArrayOpts & {
  keys?: (keyof T & string)[];
};

/**
 * Creates an Arbitrary that generates arrays of objects.
 *
 * Each row is generated by choosing from the shapes allowed by a RowPicker.
 *
 * Properties whose names appear in {@link TableOpts.keys} will be constrained
 * to be unique columns. Each possible row shape must define a property for each
 * unique column. The property definitions for a unique column must all use the
 * same Domain.
 */
export function table<R extends Record<string, unknown>>(
  row: RowPicker<R>,
  opts?: TableOpts<R>,
): Arbitrary<R[]> {
  const { min, max } = parseArrayOpts(opts);
  const uniqueKeys = opts?.keys ?? [];
  const cases = row.cases;

  const keyShape: Partial<RowShape<R>> = {};
  for (const key of uniqueKeys) {
    const first = cases[0].shape[key];
    if (!(first instanceof Domain)) {
      throw new Error(
        `property '${key}' is declared unique but not specified by a Domain`,
      );
    }

    for (let i = 1; i < cases.length; i++) {
      if (cases[i].shape[key] !== first) {
        throw new Error(
          `property '${key}' is declared unique, but case ${i} doesn't match case 0`,
        );
      }
    }
    keyShape[key] = first;

    const count = countDistinct(first, min);
    if (count < min) {
      const value = count === 1 ? "value" : "values";
      throw new Error(
        `property '${key}' has ${count} unique ${value}, but length.min is ${min}`,
      );
    }
  }

  const startRegionSize = 20;
  const [startBias, extendedBias] = arrayLengthBiases(max - min, {
    startRegionSize,
  });

  const startCoin = arb.biased(startBias);
  const extendedCoin = arb.biased(extendedBias);

  function wantItem(i: number, pick: PickFunction): boolean {
    if ((i - min) < startRegionSize) {
      return pick(startCoin);
    } else {
      return pick(extendedCoin);
    }
  }

  return arb.from((pick) => {
    const jar = new RowJar(row.cases, keyShape);

    const rows: R[] = [];

    const addRow: Script<R | undefined> = Script.make("addRow", (pick) => {
      if (rows.length < min) {
        jar.assertNotEmpty();
      } else {
        if (max !== undefined && rows.length >= max) {
          return undefined;
        }
        if (jar.isEmpty()) {
          return undefined;
        }
        if (!wantItem(rows.length, pick)) {
          return undefined;
        }
      }

      return jar.takeAny(pick);
    });

    for (let row = pick(addRow); row !== undefined; row = pick(addRow)) {
      rows.push(row);
    }
    if (jar.isEmpty()) {
      // Add an ending pick to match a regular array.
      pick(new PickRequest(0, 0));
    }
    return rows;
  }).with({ name: "table" });
}
