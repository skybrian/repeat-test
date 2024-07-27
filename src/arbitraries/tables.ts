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
    const jar = uniqueKey ? new Jar(shape[uniqueKey]) : undefined;

    const addRow: Arbitrary<R | undefined> = arb.from((pick) => {
      if (jar?.isEmpty() || !pick(arb.boolean())) {
        return undefined;
      }
      const row: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        if (jar && key === uniqueKey) {
          row[key] = jar.pickUnused(pick);
        } else {
          row[key] = pick(shape[key]);
        }
      }
      return row as R;
    });

    const rows: R[] = [];
    for (let row = pick(addRow); row !== undefined; row = pick(addRow)) {
      rows.push(row);
    }
    return rows;
  }, { label });
}
