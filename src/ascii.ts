import { assert } from "@std/assert/assert";

/**
 * Maps a pick to an ascii character. The codes used to do picks are rearranged
 * for better shrinking.
 */
export const pickToAscii: string[] = (() => {
  const out: string[] = [];

  function pushRange(start: number, end: number): void {
    for (let i = start; i <= end; i++) {
      out.push(String.fromCharCode(i));
    }
  }

  pushRange(97, 122); // lowercase
  pushRange(65, 90); // uppercase
  pushRange(48, 57); // digits
  pushRange(33, 47); // ! " # $ % & ' ( ) * + , - . /
  pushRange(58, 64); // : ; < = > ? @
  pushRange(91, 96); // [ \ ] ^ _ `
  pushRange(123, 126); // { | } ~

  const whitespaces = [9, 10, 11, 12, 13, 32]; // \t, \n, \v, \f, \r, space
  whitespaces.forEach((code) => {
    out.push(String.fromCharCode(code));
  });

  // all other control characters
  for (let i = 0; i < 32; i++) {
    if (!whitespaces.includes(i)) {
      out.push(String.fromCharCode(i));
    }
  }
  out.push(String.fromCharCode(127)); // DEL
  return out;
})();

export const asciiToPick: number[] = (() => {
  const out = new Array(128).fill(-1);
  for (let pick = 0; pick < pickToAscii.length; pick++) {
    const char = pickToAscii[pick];
    const code = char.charCodeAt(0);
    assert(code >= 0 && code < 128);
    assert(out[code] === -1);
    out[code] = pick;
  }
  return out;
})();
