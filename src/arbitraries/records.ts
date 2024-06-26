import Arbitrary from "../arbitrary_class.ts";
import * as arb from "../arbitraries/basics.ts";

type AnyRecord = Record<string, unknown>;
type RecordShape<T extends AnyRecord> = { [K in keyof T]: Arbitrary<T[K]> };

const empty: Arbitrary<Record<string, never>> = arb.bit().map((b) =>
  b === 0 ? {} : Object.create(null)
);

/**
 * Creates an Arbitrary for a record with the given shape.
 *
 * To ensure both cases are tested, the generated object may have a prototype or
 * not.
 */
export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  if (Object.keys(shape).length === 0) {
    return empty as Arbitrary<T>;
  }
  const keys = Object.keys(shape) as (keyof T)[];
  return Arbitrary.from((pick) => {
    const result = pick(empty) as Partial<T>;
    for (const key of keys) {
      result[key] = pick(shape[key]);
    }
    return result as T;
  });
}
