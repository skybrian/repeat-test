import Arbitrary from "../arbitrary_class.ts";
import * as arb from "./basics.ts";

const asciiTable = arb.of(...(() => {
  const out: string[] = [];

  function pushRange(start: number, end: number): void {
    for (let i = start; i <= end; i++) {
      out.push(String.fromCharCode(i));
    }
  }

  pushRange(97, 122); // lowercase
  pushRange(65, 90); // uppercase
  pushRange(48, 57); // digits
  pushRange(33, 47); // ! " # $ % & ' ( ) * + , - . /
  pushRange(58, 64); // : ; < = > ? @
  pushRange(91, 96); // [ \ ] ^ _ `
  pushRange(123, 126); // { | } ~

  const whitespaces = [9, 10, 11, 12, 13, 32]; // \t, \n, \v, \f, \r, space
  whitespaces.forEach((code) => {
    out.push(String.fromCharCode(code));
  });

  // all other control characters
  for (let i = 0; i < 32; i++) {
    if (!whitespaces.includes(i)) {
      out.push(String.fromCharCode(i));
    }
  }
  out.push(String.fromCharCode(127)); // DEL
  return out;
})());

/**
 * The ascii characters, optionally matching a regular expression. They are
 * reordered to put characters that look nicer in examples first.
 */
export function asciiChar(regexp?: RegExp): Arbitrary<string> {
  if (regexp === undefined) {
    return asciiTable;
  }
  return asciiTable.filter((c) => regexp.test(c)).precompute();
}

/** The characters a-z and A-Z, in that order. */
export const asciiLetter = asciiChar(/[a-zA-Z]/).asFunction();

/** The characters 0-9, in that order. */
export const asciiDigit = asciiChar(/\d/).asFunction();

export const asciiWhitespace = arb.of(..." \t\n\v\f\r".split("")).asFunction();

/** Ascii characters that are not letters, digits, whitespace, or control characters. */
// deno-lint-ignore no-control-regex
export const asciiSymbol = asciiChar(/[^ a-zA-Z0-9\x00-\x1f\x7f]/).asFunction();

/**
 * All strings of length 1, containing single 16-bit code unit.
 *
 * Some of these strings aren't well-formed because they are unpaired
 * surrogates. It's useful when you want to test your code to handle
 * badly-formed strings.
 */
export function char16(): Arbitrary<string> {
  return charCode.map((code) => String.fromCharCode(code));
}

const defaultChar = "x".charCodeAt(0);
const charCode = arb.int(0, 0xffff, { default: defaultChar });

const surrogateMin = 0xd800;
const surrogateMax = 0xdfff;
const surrogateGap = surrogateMax - surrogateMin + 1;
const unicodeMax = 0x10ffff;

const codePoint = arb.int(0, unicodeMax - surrogateGap, {
  default: defaultChar,
}).map(
  (code) => (code >= surrogateMin) ? code + surrogateGap : code,
);

/**
 * All well-formed strings that correspond to a single Unicode code point. The
 * length of the string will be 1 or 2, depending on whether they're encoded
 * using surrogate pairs.
 *
 * Code points in the range 0xd800 to 0xdfff are possible in Javascript, but
 * they aren't included because they decode to unpaired surrogates, which aren't
 * well-formed.
 */
export function unicodeChar(): Arbitrary<string> {
  return codePoint.map(
    (code) => String.fromCodePoint(code),
  );
}

const defaultStringLimit = 500;

/**
 * Arbitrary strings, well-formed or not. Includes unpaired surrogates.
 *
 * Min and max are measured in code units, the same as `String.length`.
 */
export function anyString(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultStringLimit;
  return arb.array(charCode, { min, max }).map((arr) =>
    String.fromCharCode(...arr)
  );
}

/**
 * Arbitrary well-formed strings.
 *
 * Min and max are measured in code points. `String.length` will be longer if it
 * contains surrogate pairs.
 */
export function wellFormedString(
  opts?: { min?: number; max?: number },
): Arbitrary<string> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? defaultStringLimit;
  return arb.array(codePoint, { min, max }).map((arr) =>
    String.fromCodePoint(...arr)
  );
}
