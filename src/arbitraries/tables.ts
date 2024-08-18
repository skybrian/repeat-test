import type { AnyRecord } from "../types.ts";
import type { Arbitrary } from "../arbitrary_class.ts";
import * as arb from "./basics.ts";
import type * as dom from "../domains/basics.ts";
import { Jar } from "../jar_class.ts";
import type { Domain } from "../domain_class.ts";
import { PickRequest } from "../picks.ts";

/**
 * Defines an Arbitrary that generates an array by taking distinct values from a
 * Domain.
 *
 * (The comparison is done using the canonical pick sequence for each value.)
 */
export function uniqueArray<T>(
  item: Domain<T>,
  opts?: { label?: string },
): Arbitrary<T[]> {
  const label = opts?.label ?? "uniqueArray";

  return arb.from((pick) => {
    const jar = new Jar(item);
    const out: T[] = [];
    while (!jar.isEmpty() && pick(arb.boolean())) {
      out.push(jar.take(pick));
    }
    if (jar.isEmpty()) {
      // Add an ending pick to match a regular array.
      pick(new PickRequest(0, 0));
    }
    return out;
  }, { label });
}

/**
 * Constraints used when generating or validating tables.
 */
export type TableOpts<T extends AnyRecord> = {
  label?: string;
  uniqueKeys?: (keyof T & string)[];
  maxRows?: number;
};

/**
 * Defines an Arbitrary that generates arrays of records with a given shape.
 *
 * Columns may be further constrained using the uniqueKeys option, so that
 * generated arrays won't contain duplicate values in that column.
 *
 * (Columns are defined using a {@link Domain} instead of an {@link Arbitrary}
 * due to how unique keys are implemented.)
 */
export function table<R extends AnyRecord>(
  shape: dom.RecordShape<R>,
  opts?: TableOpts<R>,
): Arbitrary<R[]> {
  const uniqueKeys = opts?.uniqueKeys ?? [];

  const label = opts?.label ?? "table";

  return arb.from((pick) => {
    const jars: Record<string, Jar<R[keyof R & string]>> = {};
    for (const key of uniqueKeys) {
      const jar = new Jar(shape[key]);
      jars[key] = jar;
    }

    const emptyJar = () => {
      for (const jar of Object.values(jars)) {
        if (jar.isEmpty()) {
          return true;
        }
      }
      return false;
    };

    const maxRows = opts?.maxRows;
    const rows: R[] = [];

    const addRow: Arbitrary<R | undefined> = arb.from((pick) => {
      if (maxRows !== undefined && rows.length >= maxRows) {
        return undefined;
      }
      if (emptyJar() || !pick(arb.boolean())) {
        return undefined;
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
  }, { label });
}
