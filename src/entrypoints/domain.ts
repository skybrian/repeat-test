/**
 * The symbols needed to define a new {@linkcode Domain}.
 *
 * @module domain
 */

export type { Failure, Success } from "../results.ts";
export type { SendErr } from "../options.ts";
export type { PickifyFunction } from "../domain_class.ts";
export type { RowShape } from "../domains/rows.ts";

export { Domain, ParseError } from "../domain_class.ts";
export { RowDomain } from "../domains/rows.ts";
export { Jar } from "../jar_class.ts";
