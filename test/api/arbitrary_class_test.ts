import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { arb, repeatTest } from "@skybrian/repeat-test";
import {
  Arbitrary,
  type BuildFunction,
  Filtered,
  IntRequest,
} from "@skybrian/repeat-test/core";
import { assertThrows } from "./support/asserts.ts";

describe("Arbitrary", () => {
  describe("from", () => {
    it("throws if given a callback that throws", () => {
      assertThrows(
        () =>
          Arbitrary.from(() => {
            throw new Error("oops");
          }),
        Error,
        "oops",
      );
    });

    it("throws an Error if the Arbitrary didn't generate any values", () => {
      assertThrows(
        () =>
          Arbitrary.from(() => {
            throw new Filtered("oops");
          }),
        Error,
        "can't create Arbitrary for 'untitled' because no randomly-generated values were accepted",
      );
    });

    it("throws an Error if the callback calls pick incorrectly", () => {
      type Pick = (arg: unknown) => number;
      const build = ((pick: Pick) => pick("hello")) as BuildFunction<number>;
      assertThrows(
        () => Arbitrary.from(build),
        Error,
        "pick function called with an invalid argument",
      );
    });
  });

  describe("of", () => {
    it("throws if called with no arguments", () => {
      assertThrows(
        () => Arbitrary.of(),
        Error,
        "Arbitrary.of() requires at least one item",
      );
    });

    it("throws if passed a non-frozen object", () => {
      assertThrows(
        () => Arbitrary.of({}),
        Error,
        "Arbitrary.of() requires frozen objects",
      );
    });
  });

  describe("map", () => {
    it("has a name by default", () => {
      const mapped = Arbitrary.from(new IntRequest(1, 6)).map((n) => n * 2);
      strictEqual(mapped.name, "map");
    });
  });

  describe("chain", () => {
    it("has a name by default", () => {
      const hello = Arbitrary.from(() => "hello");
      const world = hello.chain(() => Arbitrary.from(() => "world"));
      strictEqual(world.name, "chain");
    });
  });

  describe("maxSize", () => {
    it("returns the size of an IntRequest", () => {
      strictEqual(Arbitrary.from(new IntRequest(1, 3)).maxSize, 3);
    });

    it("returns the same size after mapping", () => {
      strictEqual(
        Arbitrary.from(new IntRequest(1, 3)).map((n) => n + 1).maxSize,
        3,
      );
    });

    it("returns the same size after filtering", () => {
      strictEqual(
        Arbitrary.from(new IntRequest(1, 3)).filter((n) => n % 2 === 0)
          .maxSize,
        3,
      );
    });

    it("returns 1 for a constant Arbitrary", () => {
      strictEqual(Arbitrary.of("hi").maxSize, 1);
    });

    it("returns 1 after mapping a constant Arbitrary", () => {
      strictEqual(Arbitrary.of("hi").map((s) => s + " there").maxSize, 1);
    });

    it("returns 1 after filtering a constant Arbitrary", () => {
      strictEqual(
        Arbitrary.of("hi").filter((s) => s === "hi").maxSize,
        1,
      );
    });
  });

  describe("buildPick", () => {
    it("works in a build script", () => {
      const zero = arb.from((pick) => Arbitrary.of(0).directBuild(pick));
      repeatTest(zero, (val) => {
        strictEqual(val, 0);
      });
    });
  });

  describe("toString", () => {
    it("returns a string with the name", () => {
      strictEqual(Arbitrary.of(1, 2, 3).toString(), "Arbitrary('3 examples')");
    });
  });
});
