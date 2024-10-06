/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type { Failure, Success } from "../results.ts";

export type { BuildFunction, Pickable } from "../pickable.ts";

export type {
  PickList,
  PickRequestOpts,
  RandomPicker,
  RandomSource,
} from "../picks.ts";

export type { StreamEditor } from "../edits.ts";

export type {
  IntPickerMiddleware,
  PickFunction,
  PickFunctionOpts,
} from "../build.ts";

export type { RecordShape } from "../options.ts";

export { biasedBitRequest, PickRequest } from "../picks.ts";
export { Gen } from "../gen_class.ts";
export { Script } from "../build.ts";
export { Arbitrary } from "../arbitrary_class.ts";
