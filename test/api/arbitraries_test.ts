import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import * as arb from "@skybrian/repeat-test/arbs";
import { generateDefault } from "@skybrian/repeat-test/runner";

describe("arbitrary builders", () => {
  it("maps an integer default to a structured value", () => {
    const mapped = arb.int(2, 4).map((n) => ({
      label: `item-${n}`,
      twice: n * 2,
    }));
    deepStrictEqual(generateDefault(mapped).val, { label: "item-2", twice: 4 });
  });

  it("chains into an array whose length depends on the first value", () => {
    const dependent = arb.int(2, 4).chain((length) =>
      arb.array(arb.int(length, length + 1), { length })
    );
    deepStrictEqual(generateDefault(dependent).val, [2, 2]);
  });

  it("filters out the original default before mapping", () => {
    const filtered = arb.int(0, 3).filter((n) => n >= 2).map((n) =>
      `kept-${n}`
    );
    strictEqual(generateDefault(filtered).val, "kept-2");
  });

  it("generates defaults through nested objects and arrays", () => {
    const nested = arb.object({
      enabled: arb.boolean(),
      rows: arb.array(
        arb.object({
          id: arb.int(5, 9),
          tags: arb.array(arb.int(-3, 3)),
        }),
        { length: { min: 1, max: 2 } },
      ),
    });
    deepStrictEqual(generateDefault(nested).val, {
      enabled: false,
      rows: [{ id: 5, tags: [] }],
    });
  });

  it("defaults integers to the boundary nearest zero", () => {
    strictEqual(generateDefault(arb.int(1, 6)).val, 1);
    strictEqual(generateDefault(arb.int(-6, -1)).val, -1);
    strictEqual(generateDefault(arb.int(-6, 6)).val, 0);
  });

  it("supports singleton ranges at both safe integer boundaries and zero", () => {
    for (const n of [Number.MIN_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER]) {
      strictEqual(generateDefault(arb.int(n, n)).val, n);
    }
  });

  it("supports explicitly empty arrays with fixed or maximum length zero", () => {
    for (const length of [0, { max: 0 }]) {
      deepStrictEqual(
        generateDefault(arb.array(arb.int(1, 2), { length })).val,
        [],
      );
    }
  });

  it("composes fixed-length arrays into a rectangular matrix", () => {
    const matrix = arb.array(
      arb.array(arb.int(-4, -2), { length: 3 }),
      { length: 2 },
    );
    deepStrictEqual(generateDefault(matrix).val, [
      [-2, -2, -2],
      [-2, -2, -2],
    ]);
  });

  it("rejects array minimum lengths above their maximum", () => {
    throws(
      () => arb.array(arb.boolean(), { length: { min: 3, max: 2 } }),
      {
        name: "Error",
        message:
          "length constraint for array is invalid; want: min <= max, got: 3..2",
      },
    );
  });

  it("rejects reversed, fractional, unsafe, and nonfinite integer ranges", () => {
    for (
      const [min, max] of [
        [2, 1],
        [-1, -2],
        [0.5, 2],
        [-2, -0.5],
        [0, Number.MAX_SAFE_INTEGER + 1],
        [Number.MIN_SAFE_INTEGER - 1, 0],
        [0, Infinity],
        [NaN, 1],
      ]
    ) {
      throws(() => arb.int(min, max), Error, `range ${min}..${max}`);
    }
  });
});
