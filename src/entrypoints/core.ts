/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";

export type { SendErr } from "../options.ts";
export type { RowPattern } from "../domains/rows.ts";

export type {
  BuildFunction,
  ObjectShape,
  Pickable,
  PickFunction,
  PickFunctionOpts,
  Row,
} from "../pickable.ts";

export type { HasScript, ScriptOpts } from "../script_class.ts";

export type {
  IntRequestOpts,
  PickSink,
  RandomPicker,
  RandomSource,
  Range,
} from "../picks.ts";

export type { PickifyFunction, RowShape } from "../domain_class.ts";

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
