import { AnyRecord } from "../types.ts";
import Arbitrary, { RecordShape } from "../arbitrary_class.ts";
import * as arb from "./basics.ts";
import { Jar } from "../jar_class.ts";

export function uniqueArray<T>(
  choices: Arbitrary<T>,
  opts?: { label?: string },
): Arbitrary<T[]> {
  const label = opts?.label ?? "uniqueArray";
  return arb.from((pick) => {
    const jar = new Jar(choices);
    const out: T[] = [];
    while (!jar.isEmpty() && pick(arb.boolean())) {
      out.push(jar.pickUnused(pick));
    }
    return out;
  }, { label });
}

export type TableOpts<T extends AnyRecord> = {
  label?: string;
  uniqueKey?: keyof T;
};

export function table<R extends AnyRecord>(
  shape: RecordShape<R>,
  opts?: TableOpts<R>,
): Arbitrary<R[]> {
  const uniqueKey = opts?.uniqueKey;

  const label = opts?.label ?? "table";

  return arb.from((pick) => {
    const used = uniqueKey ? new Set<R[typeof uniqueKey]>() : undefined;
    const addToUsed = (row: R) => {
      if (used && uniqueKey) {
        used.add(row[uniqueKey]);
      }
    };

    // Hack: creating `row` in advance bypasses the check that a filter has a
    // default value. (Because we mutate `seen` after creating the filter.) We
    // need a different way to keep track of what's been used.
    const row = arb.record(shape).filter((row) => {
      if (used && uniqueKey) {
        return !used.has(row[uniqueKey]);
      }
      return true;
    });

    const addRow: Arbitrary<R | undefined> = arb.from((pick) => {
      if (!pick(arb.boolean())) {
        return undefined;
      }
      return pick(row);
    });

    const rows: R[] = [];
    for (let row = pick(addRow); row !== undefined; row = pick(addRow)) {
      addToUsed(row);
      rows.push(row);
    }
    return rows;
  }, { label });
}
