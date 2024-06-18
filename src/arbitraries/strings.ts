import { Arbitrary, array, biasedInt } from "./core.ts";

const defaultChar = "x".charCodeAt(0);
const charCode = biasedInt(0, 0xffff, { default: defaultChar });
const codePoint = biasedInt(0, 0x10ffff, { default: defaultChar });

/**
 * A string of length 1 containing any code unit, including unpaired surrogates
 */
export const char16: Arbitrary<string> = charCode.map((code) =>
  String.fromCharCode(code)
);

/**
 * A string containing any Unicode code point. The length of the
 * string will be 1 or 2, depending on whether it's encoded using
 * surrogate pairs.
 */
export const unicodeChar: Arbitrary<string> = codePoint.map(
  (code) => String.fromCodePoint(code),
);

/**
 * Any string, including unpaired surrogates.
 *
 * Min and max are measured in code units, the same as `String.length`.
 */
export function anyString(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  return array(charCode, opts).map((arr) => String.fromCharCode(...arr));
}

/**
 * Any well-formed string.
 *
 * Min and max are measured in code units. `String.length` will be longer
 * if it contains surrogate pairs.
 */
export function wellFormedString(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  return array(codePoint, opts).map((arr) => String.fromCodePoint(...arr));
}
