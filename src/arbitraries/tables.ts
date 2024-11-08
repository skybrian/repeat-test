import type { Arbitrary, PickFunction, RowMaker } from "@/arbitrary.ts";
import type { ArrayOpts, TableOpts } from "../options.ts";

import { assert } from "@std/assert/assert";
import { Domain, Jar } from "@/domain.ts";
import { PickRequest } from "../picks.ts";
import { parseArrayOpts } from "../options.ts";
import { generateAll } from "../ordered.ts";
import { PickTree } from "../pick_tree.ts";
import { arrayLengthBiases } from "../math.ts";
import { Script } from "../script_class.ts";

import * as arb from "./basics.ts";

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
      out.push(jar.take(pick));
    }
    while (out.length < max) {
      if (jar.isEmpty()) {
        // Add an ending pick to match a regular array.
        pick(new PickRequest(0, 0));
        return out;
      } else if (!wantItem(out.length, pick)) {
        return out;
      }
      out.push(jar.take(pick));
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
 * Defines an Arbitrary that generates arrays of objects with a given shape.
 *
 * Properties whose names appear in {@link TableOpts.keys} will be constrained to be
 * unique columns. The comparison is done using their canonical pick sequences,
 * so they must be defined using a {@link Domain}.
 */
export function table<R extends Record<string, unknown>>(
  row: RowMaker<R>,
  opts?: TableOpts<R>,
): Arbitrary<R[]> {
  const shape = row.props;
  const { min, max } = parseArrayOpts(opts);
  const uniqueKeys = opts?.keys ?? [];

  const domains: Record<string, Domain<R[keyof R & string]>> = {};
  for (const key of uniqueKeys) {
    const set = shape[key];
    if (!(set instanceof Domain)) {
      throw new Error(
        `property "${key}" is declared unique but not specified by a Domain`,
      );
    }
    domains[key] = set;
    const count = countDistinct(set, min);
    if (count < min) {
      throw new Error(
        `property "${key}" has only ${count} unique value, but length.min is ${min}`,
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
    const jars: Record<string, Jar<R[keyof R & string]>> = {};
    for (const key of uniqueKeys) {
      jars[key] = new Jar(domains[key]);
    }

    const emptyJar = () => {
      for (const jar of Object.values(jars)) {
        if (jar.isEmpty()) {
          return true;
        }
      }
      return false;
    };

    const rows: R[] = [];

    const addRow: Script<R | undefined> = Script.make("addRow", (pick) => {
      if (rows.length < min) {
        for (const jar of Object.values(jars)) {
          assert(!jar.isEmpty());
        }
      } else {
        if (max !== undefined && rows.length >= max) {
          return undefined;
        }
        if (emptyJar()) {
          return undefined;
        }
        if (!wantItem(rows.length, pick)) {
          return undefined;
        }
      }

      const row: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const jar = jars[key];
        if (jar) {
          row[key] = jar.take(pick);
        } else {
          row[key] = pick(shape[key]);
        }
      }
      return row as R;
    });

    for (let row = pick(addRow); row !== undefined; row = pick(addRow)) {
      rows.push(row);
    }
    if (emptyJar()) {
      // Add an ending pick to match a regular array.
      pick(new PickRequest(0, 0));
    }
    return rows;
  }).with({ name: "table" });
}
