/**
 * The repeat-test library provides functions for writing property tests.
 *
 * Write tests using {@linkcode repeatTest}. Test data can be generated using an
 * {@link Arbitrary}. The {@linkcode arb} namespace has many useful functions
 * for defining new Arbitraries.
 */

export * from "@skybrian/repeat-test/arbitrary";
export * from "@skybrian/repeat-test/domain";
export * from "@skybrian/repeat-test/runner";
export * as arb from "@skybrian/repeat-test/arbs";
export * as dom from "@skybrian/repeat-test/doms";
