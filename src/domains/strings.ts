import Domain from "../domain_class.ts";
import * as arb from "../arbitraries.ts";
import { isWellFormed } from "../workarounds.ts";
import * as unicode from "../unicode.ts";

export const asciiChar = new Domain(arb.asciiChar(), (val) => {
  const gen = arb.asciiChar().findGenerated((s) => s === val);
  if (!gen) return undefined;
  return gen.replies();
}).asFunction();

export const char16 = new Domain(arb.char16(), (val) => {
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

export const anyString = new Domain(
  arb.anyString({ min: 0, max: maxStringLength }),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string");
      return undefined;
    }
    const out: number[] = [];
    for (let i = 0; i < val.length; i++) {
      const picks = char16().pickify(val.charAt(i));
      if (picks === undefined) return undefined;
      out.push(1);
      out.push(...picks);
    }
    out.push(0);
    return out;
  },
).asFunction();

export const wellFormedString = new Domain(
  arb.wellFormedString(),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string");
      return undefined;
    }
    if (!isWellFormed(val)) {
      sendErr("not a well-formed string");
      return undefined;
    }

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
  },
).asFunction();
