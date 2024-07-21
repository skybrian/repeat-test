import Codec from "../codec_class.ts";
import * as arb from "../arbitraries.ts";
import { isWellFormed } from "../workarounds.ts";
import * as unicode from "../unicode.ts";

export function asciiChar(): Codec<string> {
  const domain = arb.asciiChar();
  return new Codec(domain, (val) => {
    const sol = arb.asciiChar().findSolution((s) => s === val);
    if (!sol) return undefined;
    return sol.playout.picks.replies;
  });
}

export function char16(): Codec<string> {
  const domain = arb.char16();
  return new Codec(domain, (val) => {
    if (typeof val !== "string") return undefined;
    if (val.length !== 1) return undefined;
    const code = val.codePointAt(0);
    if (code === undefined) return undefined;
    if (code < 128) {
      return asciiChar().encode(val);
    }
    return [code];
  });
}

export function anyString() {
  // Using the max array size here because the implementation uses arrays.
  const domain = arb.anyString({ min: 0, max: 2 ** 32 - 1 });

  const item = char16();

  return new Codec(domain, (val) => {
    if (typeof val !== "string") return undefined;
    const out: number[] = [];
    for (let i = 0; i < val.length; i++) {
      const encoded = item.encode(val.charAt(i));
      if (encoded === undefined) return undefined;
      out.push(1);
      out.push(...encoded);
    }
    out.push(0);
    return out;
  });
}

export function wellFormedString(): Codec<string> {
  const domain = arb.wellFormedString();

  return new Codec(domain, (val) => {
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
        out.push(...asciiChar().encode(char));
      } else {
        const pick = code < unicode.surrogateMin
          ? code
          : code - unicode.surrogateGap;
        out.push(pick);
      }
    }
    out.push(0);
    return out;
  });
}
