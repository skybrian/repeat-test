/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";

export type {
  BuildFunction,
  Pickable,
  PickFunction,
  PickFunctionOpts,
} from "../pickable.ts";

export type {
  PickRequestOpts,
  PickSink,
  RandomPicker,
  RandomSource,
  Range,
} from "../picks.ts";

export type { RecordShape } from "../options.ts";

export { Filtered } from "../pickable.ts";
export { biasedBitRequest, PickRequest } from "../picks.ts";
export { Gen } from "../gen_class.ts";
export { Arbitrary } from "../arbitrary_class.ts";
