/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";

export type {
  IntEditor,
  PickList,
  PickRequestOpts,
  RandomPicker,
  RandomSource,
} from "../picks.ts";

export type {
  BuildFunction,
  IntPickerMiddleware,
  PickFunction,
  PickFunctionOpts,
  PickSet,
} from "../generated.ts";

export type { RecordShape } from "../options.ts";

export { biasedBitRequest, PickRequest } from "../picks.ts";
export { Gen } from "../gen_class.ts";
export { Arbitrary } from "../arbitrary_class.ts";
