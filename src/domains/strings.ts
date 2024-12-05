import { assert } from "@std/assert";
import { Domain } from "@/core.ts";
import * as arb from "@/arbs.ts";

import * as unicode from "../unicode.ts";
import { parseArrayOpts } from "../options.ts";
import { asciiToPick } from "../ascii.ts";

const arbAscii = arb.asciiChar();

const asciiDom = Domain.make(arbAscii, (val, sendErr) => {
  if (typeof val !== "string") {
    sendErr("not a string", val);
    return undefined;
  }
  const code = val.charCodeAt(0);
  if (code < 0 || code >= 128 || val.length !== 1) {
    sendErr("not an ascii character", val);
    return undefined;
  }
  return [asciiToPick[code]];
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
export const char16: () => Domain<string> = Domain.make(
  arb.char16(),
  (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string", val);
      return undefined;
    }
    if (val.length > 1) {
      sendErr("not a single character", val);
      return undefined;
    }
    const code = val.charCodeAt(0);
    if (Number.isNaN(code)) {
      sendErr("not a single character", val);
      return undefined;
    }

    if (code < 128) {
      return asciiChar().innerPickify(val, sendErr);
    }
    return [code];
  },
).asFunction();

/**
 * Returns a domain that accepts any JavaScript string.
 *
 * (That is, they may contain unpaired surrogates.)
 */
export function string(opts?: arb.ArrayOpts): Domain<string> {
  const { min, max } = parseArrayOpts(opts);
  return Domain.make(arb.string(opts), (val, sendErr) => {
    if (typeof val !== "string") {
      sendErr("not a string", val);
      return undefined;
    } else if (val.length < min) {
      sendErr(
        `string too short; want length >= ${min}, got: ${val.length}`,
        val,
      );
      return undefined;
    } else if (val.length > max) {
      sendErr(
        `string too long; want length <= ${max}, got: ${val.length}`,
        val,
      );
      return undefined;
    }
    const out: number[] = [];
    for (let i = 0; i < val.length; i++) {
      const picks = char16().innerPickify(val.charAt(i), sendErr, i);
      assert(picks !== undefined, "char16 should accept any character");
      if (i >= min) {
        out.push(1);
      }
      out.push(...picks);
    }
    if (val.length < max) {
      out.push(0);
    }
    return out;
  });
}

/**
 * Returns a domain that accepts well-formed strings.
 *
 * (That is, they don't contain unpaired surrogates.)
 */
export function wellFormedString(opts?: arb.ArrayOpts): Domain<string> {
  const { min, max } = parseArrayOpts(opts);
  return Domain.make(
    arb.wellFormedString(opts),
    (val, sendErr) => {
      if (typeof val !== "string") {
        sendErr("not a string", val);
        return undefined;
      } else if (val.length < min) {
        sendErr(
          `string too short; want length >= ${min}, got: ${val.length}`,
          val,
        );
        return undefined;
      } else if (val.length > max) {
        sendErr(
          `string too long; want length <= ${max}, got: ${val.length}`,
          val,
        );
        return undefined;
      }

      const out: number[] = [];
      let i = 0;
      for (const char of val) {
        const code = char.codePointAt(0);
        assert(code !== undefined, "for loop should return code points");
        if (unicode.isSurrogate(code)) {
          sendErr("unpaired surrogate", val, { at: i });
          return undefined;
        }
        if (i >= min) {
          out.push(1);
        }
        if (code < 128) {
          const picks = asciiChar().innerPickify(char, sendErr, i);
          assert(
            picks !== undefined,
            "asciiChar should accept characters < 128",
          );
          out.push(...picks);
        } else {
          const pick = code < unicode.surrogateMin
            ? code
            : code - unicode.surrogateGap;
          out.push(pick);
        }
        i += char.length;
      }
      if (i < max) {
        out.push(0);
      }
      return out;
    },
  );
}
