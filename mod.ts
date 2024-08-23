/**
 * The repeat-test library provides functions for writing property tests.
 *
 * Write tests using {@linkcode repeatTest}. Test data can be generated using an
 * {@link Arbitrary}. The {@linkcode arb} namespace has many useful functions
 * for defining new Arbitraries.
 */

export * from "@skybrian/repeat-test/arbitrary";
export * from "@skybrian/repeat-test/domain";

export * as arb from "./arbs.ts";
export * as dom from "./doms.ts";

export { repeatTest } from "./src/runner.ts";
export type { TestConsole } from "./src/console.ts";
export type { RepeatOpts, TestFunction } from "./src/runner.ts";
