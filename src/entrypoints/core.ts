/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";
export type { SendErr } from "../options.ts";
export type { ObjectShape } from "../scripts/scriptFromShape.ts";
export type { Row } from "../arbitraries/rows.ts";
export type { RowShape } from "../domains/rows.ts";
export type { KeyShape, TableOpts } from "../arbitraries/tables.ts";
export type { ArrayOpts } from "../options.ts";

export type {
  BuildFunction,
  Pickable,
  PickFunction,
  PickFunctionOpts,
} from "../pickable.ts";

export type { HasScript, ScriptOpts } from "../script_class.ts";

export type {
  IntRequestOpts,
  PickSink,
  RandomPicker,
  RandomSource,
  Range,
} from "../picks.ts";

export type { PickifyFunction } from "../domain_class.ts";

export { Filtered } from "../pickable.ts";
export { filtered } from "../results.ts";
export { biasedBitRequest, IntRequest } from "../picks.ts";
export { Gen } from "../gen_class.ts";
export { Script } from "../script_class.ts";
export { Arbitrary } from "../arbitrary_class.ts";
export { ArbRow } from "../arbitraries/rows.ts";

export { Domain, ParseError } from "../domain_class.ts";
export { RowDomain } from "../domains/rows.ts";
export { Jar } from "../jars.ts";
