import { strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { frozen } from "@skybrian/repeat-test";
import * as arb from "@skybrian/repeat-test/arbs";
import { type Arbitrary, Gen, IntRequest } from "@skybrian/repeat-test/core";
import { generateDefault, repeatTest } from "@skybrian/repeat-test/runner";

describe("arb.of", () => {
  it("returns a constant unchanged", () => {
    const value = frozen({ answer: 42 });
    const constant = arb.of(value);
    strictEqual(generateDefault(constant).val, value);
    strictEqual(constant.maxSize, 1);
  });

  it("defaults to the first item and can generate the other items", () => {
    const colors = arb.of("red", "green", "blue");
    strictEqual(generateDefault(colors).val, "red");
    strictEqual(colors.maxSize, 3);
    repeatTest(colors, (color) => {
      strictEqual(["red", "green", "blue"].includes(color), true);
    }, { reps: 20 });
    for (const [index, color] of ["red", "green", "blue"].entries()) {
      strictEqual(Gen.mustBuild(colors, [index]).val, color);
    }
  });

  it("rejects missing items and mutable objects", () => {
    throws(() => arb.of(), {
      name: "Error",
      message: "Arbitrary.of() requires at least one item",
    });
    throws(() => arb.of({}), {
      name: "Error",
      message: "Arbitrary.of() requires frozen objects",
    });
  });
});

describe("arb.alias", () => {
  it("generates a recursive value", () => {
    const recurse: Arbitrary<number> = arb.alias(() => depth);
    const depth = arb.from((pick): number => {
      return pick(IntRequest.bit) === 0 ? 0 : pick(recurse) + 1;
    });
    strictEqual(Gen.mustBuild(depth, [1, 1, 1, 0]).val, 3);
  });

  it("initializes lazily and caches the target across builds", () => {
    let calls = 0;
    const alias = arb.alias(() => {
      calls++;
      return arb.int(2, 3);
    });
    const row = arb.object({ value: alias });
    strictEqual(calls, 0);
    strictEqual(generateDefault(row).val.value, 2);
    strictEqual(calls, 1);
    strictEqual(Gen.mustBuild(alias, [3]).val, 3);
    strictEqual(generateDefault(alias).val, 2);
    strictEqual(calls, 1);
  });
});

describe("basic arbitrary metadata", () => {
  it("names boolean generators and reports their size", () => {
    strictEqual(arb.boolean().maxSize, 2);
    strictEqual(arb.boolean().name, "boolean");
    strictEqual(arb.biased(0.9).maxSize, 2);
    strictEqual(arb.biased(0.9).name, "biased boolean");
    strictEqual(arb.biased(0.9).with({ name: "my name" }).name, "my name");
  });

  it("names integer ranges and reports their size", () => {
    strictEqual(arb.int(1, 6).maxSize, 6);
    strictEqual(arb.int(1, 6).name, "int(1, 6)");
    strictEqual(arb.int(-6, -1).name, "int(-6, -1)");
    strictEqual(arb.int(-6, 6).name, "int(-6, 6)");
  });
});

describe("arb.biased", () => {
  it("always returns the requested constant at probabilities zero and one", () => {
    for (const probability of [0, 1]) {
      repeatTest(arb.biased(probability), (val) => {
        strictEqual(val, probability === 1);
      }, { reps: 20 });
      strictEqual(arb.biased(probability).maxSize, 1);
    }
  });

  it("rejects probabilities outside zero through one", () => {
    for (const probability of [-0.1, 1.1, -Infinity, Infinity]) {
      throws(() => arb.biased(probability), {
        name: "Error",
        message: "probability must be between 0 and 1",
      });
    }
  });
});

describe("arb.oneOf", () => {
  it("requires at least one case", () => {
    throws(() => arb.oneOf(), {
      name: "Error",
      message: "oneOf() requires at least one case",
    });
  });

  it("defaults to the first branch", () => {
    strictEqual(generateDefault(arb.oneOf(arb.int(1, 2))).val, 1);
    strictEqual(
      generateDefault(arb.oneOf(arb.int(1, 2), arb.int(3, 4), arb.int(5, 6)))
        .val,
      1,
    );
  });

  it("accepts constant alternatives and reports their combined size", () => {
    const oneOrTwo = arb.oneOf(arb.of(1), arb.of(2));
    strictEqual(oneOrTwo.maxSize, 2);
    strictEqual(Gen.mustBuild(oneOrTwo, [0]).val, 1);
    strictEqual(Gen.mustBuild(oneOrTwo, [1]).val, 2);
  });
});
