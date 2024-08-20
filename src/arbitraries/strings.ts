import { subrangeRequest } from "../picks.ts";
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

const asciiTableArb = Arbitrary.of(...asciiTable).with({ label: "asciiChar" });

/**
 * Defines an Arbitrary that generates ASCII characters.
 *
 * If an argument is provided, the Arbitrary will include the characters that
 * match the regexp. Otherwise, it will include all ASCII characters.
 */
export function asciiChar(regexp?: RegExp): Arbitrary<string> {
  if (regexp === undefined) {
    return asciiTableArb;
  }
  return Arbitrary.of(...asciiTable.filter((c) => regexp.test(c))).with({
    label: regexp.toString(),
  });
}

/**
 * Returns an Arbitrary that generates the characters a-z and A-Z.
 */
export const asciiLetter: () => Arbitrary<string> = asciiChar(/[a-zA-Z]/)
  .asFunction();

/**
 * Returns an Arbitrary that generates the characters 0-9.
 */
export const asciiDigit: () => Arbitrary<string> = asciiChar(/\d/).asFunction();

/**
 * Returns an Arbitrary that generates an ASCII whitespace character.
 */
export const asciiWhitespace: () => Arbitrary<string> = Arbitrary.of(
  ..." \t\n\v\f\r".split(""),
).with({
  label: "whitespace",
}).asFunction();

/**
 * Returns an Arbitrary that generates all ASCII characters that are not
 * letters, digits, whitespace, or control characters.
 */
export const asciiSymbol: () => Arbitrary<string> = asciiChar(
  // deno-lint-ignore no-control-regex
  /[^ a-zA-Z0-9\x00-\x1f\x7f]/,
).asFunction();

/**
 * Returns an Arbitrary that generates all JavaScript strings of length 1.
 *
 * Each string contains a single 16-bit code unit.
 *
 * Some of these strings aren't well-formed because they are unpaired
 * surrogates. It's useful when you want to test your code to handle
 * badly-formed strings.
 */
export const char16: () => Arbitrary<string> = Arbitrary.from(
  subrangeRequest([0, 128], 0xffff),
).map(
  (code) => {
    if (code < 128) {
      return asciiTable[code];
    }
    return String.fromCodePoint(code);
  },
).with({ label: "char16" }).asFunction();

const codePoint = arb.int(0, unicodeMax - surrogateGap).map(
  (code) => (code >= surrogateMin) ? code + surrogateGap : code,
);

/**
 * Returns an Arbitrary that generates strings containing a single Unicode code
 * point.
 *
 * The length of the string will be 1 or 2, depending on whether the code point
 * is encoded using surrogate pairs.
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
}).with({ label: "unicodeChar" }).asFunction();

/**
 * Defines an Arbitrary that generates JavaScript strings.
 *
 * The strings may contain unpaired surrogates. (See {@link wellFormedString} if
 * you don't want that.)
 *
 * Min and max are measured in code units, the same as `String.length`.
 */
export function string(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  return arb.array(char16(), opts).map((arr) => arr.join("")).with({
    label: "anyString",
  });
}

/**
 * Defines an Arbitrary that generates well-formed Unicode strings.
 *
 * Min and max are measured in Unicode code points, rather than code units. (The
 * length of the string may be longer due to surrogate pairs.)
 */
export function wellFormedString(
  opts?: { min?: number; max?: number },
): Arbitrary<string> {
  return arb.array(unicodeChar(), opts).map((arr) => arr.join("")).with({
    label: "wellFormedString",
  });
}
