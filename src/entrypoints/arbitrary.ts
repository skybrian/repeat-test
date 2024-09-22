/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";

export type {
  IntEditor,
  PickRequestOpts,
  RandomPicker,
  RandomSource,
} from "../picks.ts";

export type {
  IntPickerMiddleware,
  PickCallback,
  PickFunction,
  PickFunctionOpts,
  PickSet,
  Playout,
} from "../generated.ts";

export { Generated } from "../generated.ts";

export type { RecordShape } from "../options.ts";

export { biasedBitRequest, PickRequest } from "../picks.ts";
export { Arbitrary } from "../arbitrary_class.ts";
