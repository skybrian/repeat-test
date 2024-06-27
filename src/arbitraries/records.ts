import Arbitrary, { AnyRecord, RecordShape } from "../arbitrary_class.ts";

/**
 * Creates an Arbitrary for a record with the given shape.
 *
 * To ensure both cases are tested, the generated object may have a prototype or
 * not.
 */
export function record<T extends AnyRecord>(
  shape: RecordShape<T>,
): Arbitrary<T> {
  return Arbitrary.from(shape);
}
