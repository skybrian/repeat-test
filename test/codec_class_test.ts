import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import Codec from "../src/codec_class.ts";

describe("Codec", () => {
  describe("parse", () => {
    const arb = Arbitrary.from(new PickRequest(1, 6));
    const codec = new Codec(arb, (val) => {
      if (val !== 1) throw "oops";
      return [val];
    });

    it("fails when not enough values were supplied", () => {
      assertThrows(() => codec.parse([]), Error);
    });
    it("fails when too many values were supplied", () => {
      assertThrows(() => codec.parse([1, 1]), Error);
    });
    it("fails for an out-of-range value", () => {
      assertThrows(() => codec.parse([7]), Error);
    });
    it("returns the value from a successful parse", () => {
      for (let i = 1; i < 6; i++) {
        assertEquals(codec.parse([i]), i);
      }
    });
  });
});
