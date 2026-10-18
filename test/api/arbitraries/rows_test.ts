import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import * as arb from "@skybrian/repeat-test/arbs";
import { generateDefault } from "@skybrian/repeat-test/runner";

describe("arb.object", () => {
  it("generates empty and constant objects", () => {
    const empty = arb.object({});
    strictEqual(empty.name, "empty object");
    strictEqual(empty.maxSize, 1);
    deepStrictEqual(generateDefault(empty).val, {});

    const constant = arb.object({ a: arb.of(1), b: arb.of(2) });
    strictEqual(constant.name, "object");
    strictEqual(constant.maxSize, 1);
    deepStrictEqual(generateDefault(constant).val, { a: 1, b: 2 });
  });

  it("reports the size and default of an integer property", () => {
    const row = arb.object({ a: arb.int(1, 2) });
    strictEqual(row.maxSize, 2);
    deepStrictEqual(generateDefault(row).val, { a: 1 });
  });

  it("does not initialize alias properties when defining the shape", () => {
    const alias = arb.alias(() => {
      throw new Error("should not be called");
    });
    arb.object({ a: arb.int(1, 2), b: alias });
  });

  it("can change a row's name", () => {
    const row = arb.object({ a: arb.int(1, 2) }).with({ name: "foo" });
    strictEqual(row.name, "foo");
    deepStrictEqual(generateDefault(row).val, { a: 1 });
  });

  it("preserves the name when changing a row's weight", () => {
    const row = arb.object({ a: arb.int(1, 2) }).with({ weight: 3 });
    strictEqual(row.name, "object");
  });
});

describe("arb.union", () => {
  it("requires at least one case", () => {
    throws(() => arb.union<{ a: number }>(), {
      name: "Error",
      message: "union must have at least one case",
    });
  });
});
