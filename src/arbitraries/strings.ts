import { Arbitrary } from "../arbitrary_class.ts";
import * as arb from "./basics.ts";
import { surrogateGap, surrogateMin, unicodeMax } from "../unicode.ts";

const asciiTable: string[] = (() => {
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
})();

const asciiTableArb = Arbitrary.from(asciiTable, { label: "asciiChar" });

/**
 * The ascii characters, optionally matching a regular expression. They are
 * reordered to put characters that look nicer in examples first.
 */
export function asciiChar(regexp?: RegExp): Arbitrary<string> {
  if (regexp === undefined) {
    return asciiTableArb;
  }
  const label = regexp.toString();
  return Arbitrary.from(asciiTable.filter((c) => regexp.test(c)), { label });
}

/** The characters a-z and A-Z, in that order. */
export const asciiLetter: () => Arbitrary<string> = asciiChar(/[a-zA-Z]/)
  .asFunction();

/** The characters 0-9, in that order. */
export const asciiDigit: () => Arbitrary<string> = asciiChar(/\d/).asFunction();

export const asciiWhitespace: () => Arbitrary<string> = Arbitrary.from(
  " \t\n\v\f\r".split(""),
  {
    label: "whitespace",
  },
).asFunction();

/** Ascii characters that are not letters, digits, whitespace, or control characters. */
export const asciiSymbol: () => Arbitrary<string> = asciiChar(
  // deno-lint-ignore no-control-regex
  /[^ a-zA-Z0-9\x00-\x1f\x7f]/,
).asFunction();

/**
 * All strings of length 1, containing single 16-bit code unit.
 *
 * Some of these strings aren't well-formed because they are unpaired
 * surrogates. It's useful when you want to test your code to handle
 * badly-formed strings.
 */
export const char16: () => Arbitrary<string> = arb.int(0, 0xffff).map(
  (code) => {
    if (code < 128) {
      return asciiTable[code];
    }
    return String.fromCodePoint(code);
  },
  { label: "char16" },
)
  .asFunction();

const codePoint = arb.int(0, unicodeMax - surrogateGap).map(
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
export const unicodeChar: () => Arbitrary<string> = codePoint.map((code) => {
  if (code < 128) {
    return asciiTable[code];
  }
  return String.fromCodePoint(code);
}, { label: "unicodeChar" }).asFunction();

/**
 * Arbitrary strings, well-formed or not. Includes unpaired surrogates.
 *
 * Min and max are measured in code units, the same as `String.length`.
 */
export function string(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  return arb.array(char16(), opts).map((arr) => arr.join(""), {
    label: "anyString",
  });
}

/**
 * Arbitrary well-formed Unicode strings.
 *
 * Min and max are measured in code points. `String.length` will be longer if it
 * contains surrogate pairs.
 */
export function wellFormedString(
  opts?: { min?: number; max?: number },
): Arbitrary<string> {
  return arb.array(unicodeChar(), opts).map((arr) => arr.join(""), {
    label: "wellFormedString",
  });
}
