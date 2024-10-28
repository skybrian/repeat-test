import type { PickFunction, RandomSource } from "@/arbitrary.ts";
import type { ArrayOpts } from "../options.ts";

import { assert } from "@std/assert/assert";
import { Arbitrary, PickRequest, Script } from "@/arbitrary.ts";
import * as arb from "./basics.ts";
import { makeItemFunction, off } from "./arrays.ts";
import { parseArrayOpts } from "../options.ts";
import { pickToAscii } from "../ascii.ts";
import {
  supplementalPlaneStart,
  surrogateGap,
  surrogateMin,
  unicodeMax,
} from "../unicode.ts";
import { arrayLengthBiases } from "../math.ts";

const asciiTableArb = Arbitrary.of(...pickToAscii).with({ name: "asciiChar" });

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
  return Arbitrary.of(...pickToAscii.filter((c) => regexp.test(c))).with({
    name: regexp.toString(),
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
  name: "whitespace",
}).asFunction();

/**
 * Returns an Arbitrary that generates all ASCII characters that are not
 * letters, digits, whitespace, or control characters.
 */
export const asciiSymbol: () => Arbitrary<string> = asciiChar(
  // deno-lint-ignore no-control-regex
  /[^ a-zA-Z0-9\x00-\x1f\x7f]/,
).asFunction();

const char16Req = new PickRequest(0, 0xffff, {
  bias: (next: RandomSource) => {
    const r = next();
    if (r < -0x70000000) {
      return r & 0x7FF | 0xd800; // surrogates
    } else if (r < 0) {
      return r & 0x7F;
    } else {
      return r & 0xFFFF;
    }
  },
});

/**
 * Returns an Arbitrary that generates all JavaScript strings of length 1.
 *
 * Each string contains a single 16-bit code unit.
 *
 * Some of these strings aren't well-formed because they are unpaired
 * surrogates. This is useful when you want to test your code to handle
 * badly-formed strings.
 */
export const char16: () => Arbitrary<string> = Arbitrary.from(
  function char16Callback(pick) {
    const code = pick(char16Req);
    if (code < 128) {
      return pickToAscii[code];
    }
    return String.fromCodePoint(code);
  },
).with({ name: "char16", cachable: true }).asFunction();

const basicPlaneCount = supplementalPlaneStart - surrogateGap;

const codePointReq = new PickRequest(0, unicodeMax - surrogateGap, {
  bias: (next: RandomSource) => {
    const r = next();
    const plane = r & 0x1f;
    const rest = r >> 5;
    if (plane === 0 || plane > 16) {
      return Math.abs(rest) % basicPlaneCount;
    } else {
      const offset = rest & 0xffff;
      return offset + plane * 0x10000 - surrogateGap;
    }
  },
});

const codePoint = Arbitrary.from(codePointReq).map(
  (code) => {
    assert(code >= 0 && code <= unicodeMax - surrogateGap);
    return (code >= surrogateMin) ? code + surrogateGap : code;
  },
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
    return pickToAscii[code];
  }
  return String.fromCodePoint(code);
}).with({ name: "unicodeChar" }).asFunction();

const basicPlaneCodePoint = arb.int(0, 65535 - surrogateGap).map(
  (code) => (code >= surrogateMin) ? code + surrogateGap : code,
);

const basicPlaneChar = basicPlaneCodePoint.map((code) => {
  if (code < 128) {
    return pickToAscii[code];
  }
  return String.fromCodePoint(code);
});

/**
 * Defines an Arbitrary that generates JavaScript strings.
 *
 * The strings may contain unpaired surrogates. (See {@link wellFormedString} if
 * you don't want that.)
 *
 * By default, any string with a length of up to a 1000 might be generated,
 * measured in the same way as `String.length`. This can be overridden using the
 * {@link ArrayOpts.length} option.
 */
export function string(
  opts?: ArrayOpts,
): Arbitrary<string> {
  const { min, max } = parseArrayOpts(opts);
  const nextItem = makeItemFunction(char16(), min, max);

  const script = Script.make("string", function makeString(pick) {
    let out = "";
    let i = 0;
    while (true) {
      const item = nextItem(i, pick);
      if (item === off) {
        return out;
      }
      out += item;
      i++;
    }
  }, { cachable: true, logCalls: true });

  return Arbitrary.from(script);
}

/**
 * Defines an Arbitrary that generates well-formed Unicode strings.
 *
 * Min and max are measured in code units, the same as `String.length`.
 */
export function wellFormedString(
  opts?: ArrayOpts,
): Arbitrary<string> {
  const { min, max } = parseArrayOpts(opts);

  const [startBias, extendedBias] = arrayLengthBiases(max - min, {
    startRegionSize: 20,
    minProbEmpty: 0.03,
  });

  const startCoin = arb.biased(startBias);
  const extendedCoin = arb.biased(extendedBias);

  function wantItem(i: number, pick: PickFunction): boolean {
    if (i >= max) {
      return false; // done
    }
    if (i < min) {
      return true; // fixed-length portion
    }
    if (i < min + 100) {
      return pick(startCoin);
    } else {
      return pick(extendedCoin);
    }
  }

  const anyPlane = unicodeChar();

  const pickArray = (pick: PickFunction) => {
    let out = "";
    while (wantItem(out.length, pick)) {
      if (out.length < max - 1) {
        out += pick(anyPlane);
      } else {
        out += pick(basicPlaneChar);
      }
    }
    return out;
  };
  return Arbitrary.from(pickArray).with({ name: "wellFormedString" });
}
