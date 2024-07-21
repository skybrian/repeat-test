import Codec from "../codec_class.ts";
import * as arb from "../arbitraries.ts";
import { isWellFormed } from "../workarounds.ts";
import * as unicode from "../unicode.ts";

export const asciiChar = new Codec(arb.asciiChar(), (val) => {
  const sol = arb.asciiChar().findSolution((s) => s === val);
  if (!sol) return undefined;
  return sol.playout.picks.replies;
}).asFunction();

export const char16 = new Codec(arb.char16(), (val) => {
  if (typeof val !== "string") return undefined;
  if (val.length !== 1) return undefined;
  const code = val.charCodeAt(0);
  if (code === undefined) return undefined;
  if (code < 128) {
    return asciiChar().pickify(val);
  }
  return [code];
}).asFunction();

// Using the max array size here because the implementation uses arrays.
const maxStringLength = 2 ** 32 - 1;

export const anyString = new Codec(
  arb.anyString({ min: 0, max: maxStringLength }),
  (val) => {
    if (typeof val !== "string") return undefined;
    const out: number[] = [];
    for (let i = 0; i < val.length; i++) {
      const encoded = char16().pickify(val.charAt(i));
      if (encoded === undefined) return undefined;
      out.push(1);
      out.push(...encoded);
    }
    out.push(0);
    return out;
  },
).asFunction();

export const wellFormedString = new Codec(arb.wellFormedString(), (val) => {
  if (typeof val !== "string") return undefined;
  if (!isWellFormed(val)) return undefined;

  const out: number[] = [];
  for (const char of val) {
    const code = char.codePointAt(0);
    if (code === undefined || unicode.isSurrogate(code)) {
      return undefined;
    }
    out.push(1);
    if (code < 128) {
      out.push(...asciiChar().pickify(char));
    } else {
      const pick = code < unicode.surrogateMin
        ? code
        : code - unicode.surrogateGap;
      out.push(pick);
    }
  }
  out.push(0);
  return out;
}).asFunction();
