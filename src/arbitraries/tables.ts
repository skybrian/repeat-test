import type { Arbitrary, RecordShape } from "@skybrian/repeat-test/arbitrary";
import * as arb from "./basics.ts";
import { Jar } from "../jar_class.ts";
import { Domain } from "../domain_class.ts";
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
  }).with({ label });
}

/**
 * Constraints used when generating or validating tables.
 */
export type TableOpts<T extends Record<string, unknown>> = {
  label?: string;
  keys?: (keyof T & string)[];
  maxRows?: number;
};

/**
 * Defines an Arbitrary that generates arrays of records with a given shape.
 *
 * Fields whose names appear in {@link TableOpts.keys} will be constrained to be
 * unique columns. The comparison is done using their canonical pick sequences,
 * so they must be defined using a {@link Domain}.
 */
export function table<R extends Record<string, unknown>>(
  shape: RecordShape<R>,
  opts?: TableOpts<R>,
): Arbitrary<R[]> {
  const uniqueKeys = opts?.keys ?? [];

  const label = opts?.label ?? "table";

  return arb.from((pick) => {
    const jars: Record<string, Jar<R[keyof R & string]>> = {};
    for (const key of uniqueKeys) {
      const set = shape[key];
      if (!(set instanceof Domain)) {
        throw new Error(`field "${key}" is unique but not a Domain`);
      }
      const jar = new Jar(set);
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
  }).with({ label });
}
