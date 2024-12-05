/**
 * The repeat-test library provides functions for writing property tests.
 *
 * Write tests using {@linkcode repeatTest}. Test data can be generated using an
 * {@link Arbitrary}. The {@linkcode arb} namespace has many useful functions
 * for defining new Arbitraries.
 */

export * from "@/core.ts";
export * from "@/runner.ts";
export * as arb from "@/arbs.ts";
export * as dom from "@/doms.ts";
