import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { arb, generateDefault } from "../src/entrypoints/mod.ts";

/**
 * Tests that verify the default values documented in docs/defaults.md are correct.
 * If this test fails, run: deno task generate-defaults
 */
describe("documented default values", () => {
  // Primitives
  it("arb.int(1, 100) defaults to 1", () => {
    assertEquals(generateDefault(arb.int(1, 100)).val, 1);
  });

  it("arb.int(-100, -1) defaults to -1", () => {
    assertEquals(generateDefault(arb.int(-100, -1)).val, -1);
  });

  it("arb.int(-100, 100) defaults to 0", () => {
    assertEquals(generateDefault(arb.int(-100, 100)).val, 0);
  });

  it("arb.int32() defaults to 0", () => {
    assertEquals(generateDefault(arb.int32()).val, 0);
  });

  it("arb.safeInt() defaults to 0", () => {
    assertEquals(generateDefault(arb.safeInt()).val, 0);
  });

  it("arb.boolean() defaults to false", () => {
    assertEquals(generateDefault(arb.boolean()).val, false);
  });

  it("arb.biased(0.9) defaults to false", () => {
    assertEquals(generateDefault(arb.biased(0.9)).val, false);
  });

  // Strings
  it('arb.string() defaults to ""', () => {
    assertEquals(generateDefault(arb.string()).val, "");
  });

  it('arb.wellFormedString() defaults to ""', () => {
    assertEquals(generateDefault(arb.wellFormedString()).val, "");
  });

  it('arb.asciiLetter() defaults to "a"', () => {
    assertEquals(generateDefault(arb.asciiLetter()).val, "a");
  });

  it('arb.asciiDigit() defaults to "0"', () => {
    assertEquals(generateDefault(arb.asciiDigit()).val, "0");
  });

  it('arb.asciiWhitespace() defaults to " "', () => {
    assertEquals(generateDefault(arb.asciiWhitespace()).val, " ");
  });

  it('arb.char16() defaults to "a"', () => {
    assertEquals(generateDefault(arb.char16()).val, "a");
  });

  it('arb.unicodeChar() defaults to "a"', () => {
    assertEquals(generateDefault(arb.unicodeChar()).val, "a");
  });

  // Collections
  it("arb.array(...) defaults to []", () => {
    assertEquals(generateDefault(arb.array(arb.int(0, 10))).val, []);
  });

  it("arb.array(..., { length: 3 }) defaults to [0, 0, 0]", () => {
    assertEquals(generateDefault(arb.array(arb.int(0, 10), { length: 3 })).val, [0, 0, 0]);
  });

  it("arb.object({...}) defaults to object with default values", () => {
    assertEquals(
      generateDefault(arb.object({ a: arb.int(1, 5), b: arb.boolean() })).val,
      { a: 1, b: false }
    );
  });

  // Combinators
  it('arb.of("a", "b", "c") defaults to "a"', () => {
    assertEquals(generateDefault(arb.of("a", "b", "c")).val, "a");
  });

  it("arb.oneOf(...) defaults to first case's default", () => {
    assertEquals(generateDefault(arb.oneOf(arb.of(1), arb.of(2), arb.of(3))).val, 1);
  });
});
