/**
 * The symbols needed to define a new {@linkcode Arbitrary}.
 *
 * @module arbitrary
 */

export type {
  BiasedIntPicker,
  PickRequestOpts,
  UniformRandomSource,
} from "./src/picks.ts";

export type {
  Generated,
  PickCallback,
  PickFunction,
  PickFunctionOpts,
  PickSet,
} from "./src/generated.ts";

export type { RecordShape } from "./src/arbitrary_class.ts";

export { biasedBitRequest, PickRequest } from "./src/picks.ts";
export { Arbitrary } from "./src/arbitrary_class.ts";
