import { AnyRecord } from "../types.ts";
import Arbitrary from "../arbitrary_class.ts";
import * as arb from "./basics.ts";
import * as dom from "../domains/basics.ts";
import { Jar } from "../jar_class.ts";
import Domain from "../domain_class.ts";

export function uniqueArray<T>(
  item: Domain<T>,
  opts?: { label?: string },
): Domain<T[]> {
  const label = opts?.label ?? "uniqueArray";

  const generator = arb.from((pick) => {
    const jar = new Jar(item);
    const out: T[] = [];
    while (!jar.isEmpty() && pick(arb.boolean())) {
      out.push(jar.pickUnused(pick));
    }
    return out;
  }, { label });

  return new Domain(generator, (val, sendErr) => {
    const out: number[] = [];
    for (const v of val as T[]) {
      const picks = item.maybePickify(v);
      if (!picks.ok) {
        sendErr(picks.message ?? `can't parse item ${out.length} in array`);
        return undefined;
      }
      out.push(...picks.val);
    }
    return out;
  });
}

export type TableOpts<T extends AnyRecord> = {
  label?: string;
  uniqueKeys?: (keyof T & string)[];
};

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

    const addRow: Arbitrary<R | undefined> = arb.from((pick) => {
      for (const jar of Object.values(jars)) {
        if (jar?.isEmpty()) {
          return undefined;
        }
      }
      if (!pick(arb.boolean())) {
        return undefined;
      }
      const row: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const jar = jars[key];
        if (jar) {
          row[key] = jar.pickUnused(pick);
        } else {
          row[key] = pick(shape[key].generator());
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
