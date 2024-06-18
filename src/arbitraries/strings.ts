import { Arbitrary, array, biasedInt } from "./core.ts";

const defaultChar = "x".charCodeAt(0);
const charCode = biasedInt(0, 0xffff, { default: defaultChar });

/** Any code point, including unpaired surrogates */
export const char16: Arbitrary<string> = charCode.map((code) =>
  String.fromCharCode(code)
);

/** Any string, including unpaired surrogates */
export function anyString(
  opts?: { min: number; max: number },
): Arbitrary<string> {
  return array(charCode, opts).map((arr) => String.fromCharCode(...arr));
}
