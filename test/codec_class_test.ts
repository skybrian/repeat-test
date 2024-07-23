import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import Domain from "../src/codec_class.ts";

describe("Domain", () => {
  describe("parse", () => {
    const arb = Arbitrary.from(new PickRequest(1, 6));
    const dom = new Domain(arb, (val) => {
      if (val !== 1) throw "oops";
      return [val];
    });

    it("fails when not enough values were supplied", () => {
      assertThrows(() => dom.parse([]), Error);
    });
    it("fails when too many values were supplied", () => {
      assertThrows(() => dom.parse([1, 1]), Error);
    });
    it("fails for an out-of-range value", () => {
      assertThrows(() => dom.parse([7]), Error);
    });
    it("returns the value from a successful parse", () => {
      for (let i = 1; i < 6; i++) {
        assertEquals(dom.parse([i]), i);
      }
    });
  });
});
