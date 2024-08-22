/**
 * The repeat-test library provides functions for writing property tests.
 *
 * @see repeatTest for the main entry point.
 * @see arb for functions to generate test data.
 */

export type { Failure, Success } from "./src/results.ts";

export * from "./arbitrary.ts";
export type * from "./arbitrary.ts";

export * as arb from "./src/arb.ts";

export { Domain } from "./src/domain_class.ts";
export type { PickifyCallback, SendErr } from "./src/domain_class.ts";
export * as dom from "./src/dom.ts";

export { Jar } from "./src/jar_class.ts";

export { repeatTest } from "./src/runner.ts";
export type { TestConsole } from "./src/console.ts";
export type { RepeatOpts, TestFunction } from "./src/runner.ts";
