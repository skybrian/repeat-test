import { AnyRecord } from "../types.ts";
import Arbitrary, { RecordShape } from "../arbitrary_class.ts";
import * as arb from "./basics.ts";

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
