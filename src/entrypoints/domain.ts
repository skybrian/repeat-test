/**
 * The symbols needed to define a new {@linkcode Domain}.
 *
 * @module domain
 */

export type { Failure, Success } from "../results.ts";
export type { SendErr } from "../options.ts";
export type { PickifyFunction, PropShape } from "../domain_class.ts";

export { Domain, ParseError, PropDomain } from "../domain_class.ts";
export { Jar } from "../jar_class.ts";
