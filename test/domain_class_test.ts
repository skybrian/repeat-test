import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import { PickRequest } from "../src/picks.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import Domain, { PickifyCallback } from "../src/domain_class.ts";
import { repeatTest } from "../src/runner.ts";

describe("Domain", () => {
  describe("constructor", () => {
    it("throws if the default value can't be pickified", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      assertThrows(() => new Domain(arb, () => undefined), Error);
    });
    it("reports the first error from the callback", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const callback: PickifyCallback = (_, sendErr) => {
        sendErr("oops!");
        return undefined;
      };
      assertThrows(() => new Domain(arb, callback), Error, "oops");
    });
  });
  describe("pickify", () => {
    it("throws if the callback returns undefined", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const dom = new Domain(arb, (v) => v === 1 ? [v] : undefined);
      assertThrows(() => dom.pickify(2), Error, "can't pickify value");
    });
    it("reports the first error from the callback", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const dom = new Domain(arb, (v, sendErr) => {
        if (v !== 1) {
          sendErr("oops!");
          return undefined;
        }
        return [v];
      });
      assertThrows(() => dom.pickify(2), Error, "oops");
    });
  });
  describe("parsePicks", () => {
    const arb = Arbitrary.from(new PickRequest(1, 6));
    const dom = new Domain(arb, (val) => {
      if (val !== 1) throw "oops";
      return [val];
    });

    it("fails when not enough values were supplied", () => {
      assertThrows(() => dom.parsePicks([]), Error);
    });
    it("fails when too many values were supplied", () => {
      assertThrows(() => dom.parsePicks([1, 1]), Error);
    });
    it("fails for an out-of-range value", () => {
      assertThrows(() => dom.parsePicks([7]), Error);
    });
    it("returns the value from a successful parse", () => {
      for (let i = 1; i < 6; i++) {
        assertEquals(dom.parsePicks([i]), i);
      }
    });
  });
  describe("map", () => {
    describe("for a domain of even numbers", () => {
      const arb = Arbitrary.from(new PickRequest(1, 6));
      const roll = new Domain(arb, (val, sendErr) => {
        if (typeof val !== "number") {
          sendErr("not a number");
          return undefined;
        } else if (!Number.isSafeInteger(val)) {
          sendErr("not a safe integer");
          return undefined;
        } else if (val < 1) {
          sendErr("too small");
          return undefined;
        } else if (val > 6) {
          sendErr("too big");
          return undefined;
        }
        return [val];
      });
      const even = roll.map({
        map(v) {
          return v * 2;
        },
        parse(v, sendErr) {
          if (typeof v !== "number" || !Number.isSafeInteger(v)) {
            sendErr("not a safe integer");
            return undefined;
          } else if (v % 2 !== 0) {
            sendErr("not an even number");
            return undefined;
          }
          return v / 2;
        },
      });
      it("parses every number it generates", () => {
        repeatTest(even, (n) => {
          even.parse(n);
        });
      });
    });
  });
});
