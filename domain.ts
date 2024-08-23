/**
 * The symbols needed to define a new {@linkcode Domain}.
 *
 * @module domain
 */

export type { Failure, Success } from "./src/results.ts";
export {
  Domain,
  type PickifyCallback,
  type SendErr,
} from "./src/domain_class.ts";
