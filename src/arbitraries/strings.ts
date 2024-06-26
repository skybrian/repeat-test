import Arbitrary from "../arbitrary_class.ts";
import * as arb from "./basics.ts";

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
 * All strings of length 1, which contain a single 16-bit code unit.
 *
 * Some of these strings aren't well-formed because they are unpaired
 * surrogates. So, this arbitrary can be used if you want your code to handle
 * badly-formed strings somehow.
 */
export function char16(): Arbitrary<string> {
  return charCode.map((code) => String.fromCharCode(code));
}

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
