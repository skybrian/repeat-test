import type { BuildFunction, Pickable } from "../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import {
  assertFirstGenerated,
  assertGenerated,
  assertValues,
} from "./lib/asserts.ts";
import { repeatTest } from "../src/runner.ts";

import { Filtered } from "../src/pickable.ts";
import { PickRequest } from "../src/picks.ts";

import { Arbitrary } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";

const bit = new PickRequest(0, 1);

describe("Arbitrary", () => {
  describe("from", () => {
    describe("given a PickRequest", () => {
      it("generates both values", () => {
        const arb = Arbitrary.from(bit);
        assertEquals("0..1", arb.name);
        assertValues(arb, [0, 1]);
      });
    });
    describe("given a Pickable", () => {
      const answer: Pickable<string> = {
        directBuild: (pick) => {
          return pick(bit) == 1 ? "yes" : "no";
        },
      };
      it("generates both values", () => {
        const arb = Arbitrary.from(answer);
        assertEquals(arb.name, "untitled");
        assertValues(arb, ["no", "yes"]);
      });
    });
    describe("given a build function", () => {
      it("throws if given a callback that throws", () => {
        const build = () => {
          throw new Error("oops");
        };
        assertThrows(() => Arbitrary.from(build), Error, "oops");
      });
      it("throws an Error if the Arbitrary didn't generate any values", () => {
        const build = () => {
          throw new Filtered("oops");
        };
        assertThrows(
          () => Arbitrary.from(build),
          Error,
          "can't create Arbitrary for 'untitled' because no randomly-generated values were accepted",
        );
      });
      it("throws an Error if given a callback that calls pick incorrectly", () => {
        type Pick = (arg: unknown) => number;
        const build = ((pick: Pick) => pick("hello")) as BuildFunction<
          number
        >;
        assertThrows(
          () => Arbitrary.from(build),
          Error,
          "pick function called with an invalid argument",
        );
      });
    });
  });

  describe("of", () => {
    it("throws if called with no arguments", () => {
      assertThrows(
        () => Arbitrary.of(),
        Error,
        "Arbitrary.of() requires at least one argument",
      );
    });
    it("throws if passes a non-frozen object", () => {
      assertThrows(
        () => Arbitrary.of({}),
        Error,
        "Arbitrary.of() requires frozen objects",
      );
    });
    it("returns a constant Arbitrary if called with one argument", () => {
      const arb = Arbitrary.of("hi");
      assertGenerated(arb, [{ val: "hi", picks: [] }]);
      assertEquals(arb.maxSize, 1);
    });
    it("creates an Arbitrary with multiple arguments", () => {
      const arb = Arbitrary.of("hi", "there");
      assertGenerated(arb, [
        { val: "hi", picks: [0] },
        { val: "there", picks: [1] },
      ]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("oneOf", () => {
    it("throws if given an empty array", () => {
      assertThrows(
        () => Arbitrary.oneOf(),
        Error,
        "Arbitrary.oneOf() requires at least one alternative",
      );
    });
    it("accepts constant alteratives", () => {
      const arb = Arbitrary.oneOf(Arbitrary.of(1), Arbitrary.of(2));
      assertGenerated(arb, [{ val: 1, picks: [0] }, { val: 2, picks: [1] }]);
      assertEquals(arb.maxSize, 2);
    });
  });

  describe("map", () => {
    it("changes the default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      assertFirstGenerated(original, [{ val: 1, picks: [1] }]);

      const mapped = original.map((n) => n * 2);
      assertFirstGenerated(mapped, [{ val: 2, picks: [1] }]);
    });
    it("has a name by default", () => {
      const original = Arbitrary.from(new PickRequest(1, 6));
      const mapped = original.map((n) => n * 2);
      assertEquals(mapped.name, "map");
    });
  });

  describe("chain", () => {
    it("has a name by default", () => {
      const hello = Arbitrary.from(() => "hello");
      const world = hello.chain(() => Arbitrary.from(() => "world"));
      assertEquals(world.name, "chain");
    });
  });

  describe("maxSize", () => {
    describe("when the Arbitrary is based on a PickRequest", () => {
      it("returns the size of of the PickRequest", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3));
        assertEquals(oneTwoThree.maxSize, 3);
      });
      it("returns same size after mapping", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3)).map((n) =>
          n + 1
        );
        assertEquals(oneTwoThree.maxSize, 3);
      });
      it("returns same size after filtering", () => {
        const oneTwoThree = Arbitrary.from(new PickRequest(1, 3)).filter(
          (n) => n % 2 == 0,
        );
        assertEquals(oneTwoThree.maxSize, 3);
      });
    });
    describe("when the Arbitrary is based on a constant", () => {
      it("returns 1", () => {
        assertEquals(Arbitrary.of("hi").maxSize, 1);
      });
      it("returns 1 after mapping", () => {
        assertEquals(Arbitrary.of("hi").map((s) => s + " there").maxSize, 1);
      });
      it("returns 1 after filtering", () => {
        assertEquals(Arbitrary.of("hi").filter((s) => s == "hi").maxSize, 1);
      });
    });
  });

  describe("buildPick", () => {
    it("works in a build script", () => {
      // Verbose, but valid.
      const zero = arb.from((pick) => Arbitrary.of(0).directBuild(pick));
      repeatTest(zero, (val) => {
        assertEquals(val, 0);
      });
    });
  });

  describe("toString", () => {
    it("returns a string with the name", () => {
      const original = Arbitrary.of(1, 2, 3);
      assertEquals(original.toString(), "Arbitrary('3 examples')");
    });
  });
});
