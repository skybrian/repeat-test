/**
 * Various functions for defining new Arbitraries.
 *
 * @module arbs
 */

export type { ArrayOpts, TableOpts } from "../options.ts";

export * from "../arbitraries/basics.ts";
export { array } from "../arbitraries/arrays.ts";
export { object, union } from "../arbitraries/rows.ts";
export * from "../arbitraries/numbers.ts";
export * from "../arbitraries/strings.ts";
export * from "../arbitraries/tables.ts";
