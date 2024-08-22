import { arb, Domain } from "@skybrian/repeat-test";
import * as unicode from "../unicode.ts";
import { assert } from "@std/assert";
import { find } from "../multipass_search.ts";

const arbAscii = arb.asciiChar();

const asciiDom = new Domain(arbAscii, (val, sendErr) => {
  if (typeof val !== "string") {
    sendErr("not a string");
    return undefined;
  }
  const gen = find(arbAscii, (s) => s === val, { limit: 1000 });
  if (!gen) {
    sendErr("not an ascii character");
    return undefined;
  }
  return gen.replies;
});

/**
 * Creates a domain that accepts ascii characters that match a regular expression.
 *
 * If the argument is omitted, any ascii character is accepted.
 */
export function asciiChar(regexp?: RegExp): Domain<string> {
  if (!regexp) return asciiDom;
  return asciiDom.filter((val) => regexp.test(val));
}

/**
 * Returns a domain that accepts strings containing a single ascii letter.
 */
export const asciiLetter: () => Domain<string> = asciiChar(/[a-zA-Z]/)
  .asFunction();

/**
 * Returns a domain that accepts single-character strings.
 *
 * (That is, it accepts 16-bit code units, including unpaired surrogates.)
 */
export const char16: () => Domain<string> = new Domain(
  arb.char16(),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string");
      return undefined;
    }
    if (val.length > 1) {
      sendErr("not a single character");
      return undefined;
    }
    const code = val.charCodeAt(0);
    if (Number.isNaN(code)) {
      sendErr("not a single character");
      return undefined;
    }

    if (code < 128) {
      return asciiChar().innerPickify(val, sendErr);
    }
    return [code];
  },
).asFunction();

// Using the max array size here because the implementation uses arrays.
const maxStringLength = 2 ** 32 - 1;

/**
 * Returns a domain that accepts any JavaScript string.
 *
 * (That is, they may contain unpaired surrogates.)
 */
export const string: () => Domain<string> = new Domain(
  arb.string({ min: 0, max: maxStringLength }),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string");
      return undefined;
    }
    const out: number[] = [];
    for (let i = 0; i < val.length; i++) {
      const picks = char16().innerPickify(val.charAt(i), sendErr, i);
      assert(picks !== undefined, "char16 should accept any character");
      out.push(1);
      out.push(...picks);
    }
    out.push(0);
    return out;
  },
).asFunction();

/**
 * Returns a domain that accepts well-formed strings.
 *
 * (That is, they don't contain unpaired surrogates.)
 */
export const wellFormedString: () => Domain<string> = new Domain(
  arb.wellFormedString(),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string");
      return undefined;
    }

    const out: number[] = [];
    let i = 0;
    for (const char of val) {
      const code = char.codePointAt(0);
      assert(code !== undefined, "for loop should return code points");
      if (unicode.isSurrogate(code)) {
        sendErr("unpaired surrogate", { at: i });
        return undefined;
      }
      out.push(1);
      if (code < 128) {
        const picks = asciiChar().innerPickify(char, sendErr, i);
        assert(picks !== undefined, "asciiChar should accept characters < 128");
        out.push(...picks);
      } else {
        const pick = code < unicode.surrogateMin
          ? code
          : code - unicode.surrogateGap;
        out.push(pick);
      }
    }
    out.push(0);
    i++;
    return out;
  },
).asFunction();
