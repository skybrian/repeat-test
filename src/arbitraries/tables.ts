import type { Arbitrary, RecordShape } from "@/arbitrary.ts";
import { Domain, Jar } from "@/domain.ts";
import * as arb from "./basics.ts";
import { PickList, PickRequest } from "../picks.ts";

import { parseArrayOpts, type TableOpts } from "../options.ts";
import { generateAll } from "../multipass_search.ts";
import { PickTree } from "../pick_tree.ts";
import { assert } from "@std/assert/assert";

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

function countDistinct(dom: Domain<unknown>, max: number): number {
  if (max === 0) {
    return 0;
  }
  const remaining = new PickTree();
  let count = 0;
  for (const gen of generateAll(dom)) {
    const regen = dom.regenerate(gen.val);
    assert(regen.ok);
    const picks = PickList.zip(regen.reqs, regen.replies);
    if (remaining.prune(picks)) {
      count++;
      if (count >= max) {
        return max;
      }
    }
  }
  return count;
}

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
  const { min, max } = parseArrayOpts(opts);
  const uniqueKeys = opts?.keys ?? [];

  const domains: Record<string, Domain<R[keyof R & string]>> = {};
  for (const key of uniqueKeys) {
    const set = shape[key];
    if (!(set instanceof Domain)) {
      throw new Error(`field "${key}" is unique but not a Domain`);
    }
    domains[key] = set;
    const count = countDistinct(set, min);
    if (count < min) {
      throw new Error(
        `field "${key}" can't have ${min} unique values; want length.min <= ${count}, got: ${min}`,
      );
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

    const addRow: Arbitrary<R | undefined> = arb.from((pick) => {
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
        if (!pick(arb.boolean())) {
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
  }).with({ label: "table" });
}
