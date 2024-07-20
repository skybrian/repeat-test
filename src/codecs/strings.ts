import Codec from "../codec_class.ts";
import * as arb from "../arbitraries.ts";

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
    const out: number[] = [];
    for (const c of val) {
      const encoded = item.encode(c);
      if (encoded === undefined) return undefined;
      out.push(1);
      out.push(...encoded);
    }
    out.push(0);
    return out;
  });
}
