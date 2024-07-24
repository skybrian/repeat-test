import { AnyRecord } from "../types.ts";
import Arbitrary, { RecordShape } from "../arbitrary_class.ts";
import * as arb from "./basics.ts";

export function uniqueArray<T>(
  item: Arbitrary<T>,
  opts?: { label?: string },
): Arbitrary<T[]> {
  const label = opts?.label ?? "uniqueArray";
  return arb.from((pick) => {
    const items = new Set<T>();
    const filtered = item.filter((v) => !items.has(v));
    while (pick(arb.boolean())) {
      items.add(pick(filtered));
    }
    return Array.from(items);
  }, { label });
}

export type TableOpts<T extends AnyRecord> = {
  label?: string;
};

export function table<T extends AnyRecord>(
  shape: RecordShape<T>,
  opts?: TableOpts<T>,
): Arbitrary<T[]> {
  const rec = arb.record<T>(shape);
  const label = opts?.label ?? "table";
  return arb.array(rec, { label });
}
