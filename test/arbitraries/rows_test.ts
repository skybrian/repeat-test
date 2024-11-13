import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertGenerated } from "../lib/asserts.ts";
import { generateDefault } from "../../src/ordered.ts";
import * as arb from "@/arbs.ts";

describe("object", () => {
  it("can generate empty objects", () => {
    const empty = arb.object({});
    assertEquals(empty.buildScript.name, "empty object");
    assertEquals(empty.buildScript.opts.maxSize, 1);
    assertGenerated(empty, [{ val: {}, picks: [] }]);
    assertEquals(empty.cases.length, 1);
    assertEquals(Object.keys(empty.cases[0].shape), []);
  });

  it("can generate constant objects", () => {
    const example = arb.object({
      a: arb.of(1),
      b: arb.of(2),
    });
    assertEquals(example.buildScript.name, "object");
    assertEquals(example.buildScript.opts.maxSize, 1);
    assertGenerated(example, [
      { val: { a: 1, b: 2 }, picks: [] },
    ]);
    assertEquals(example.cases.length, 1);
    assertEquals(Object.keys(example.cases[0].shape), ["a", "b"]);
  });

  it("can generate one int property", () => {
    const oneProp = arb.object({
      a: arb.int(1, 2),
    });
    assertEquals(oneProp.buildScript.opts.maxSize, 2);
    assertEquals(generateDefault(oneProp).val, { a: 1 });
    assertGenerated(oneProp, [
      { val: { a: 1 }, picks: [1] },
      { val: { a: 2 }, picks: [2] },
    ]);
  });

  it("can generate two int properties", () => {
    const example = arb.object({
      a: arb.int(1, 2),
      b: arb.int(3, 4),
    });

    assertGenerated(example, [
      { val: { a: 1, b: 3 }, picks: [1, 3] },
      { val: { a: 2, b: 3 }, picks: [2, 3] },
      { val: { a: 1, b: 4 }, picks: [1, 4] },
      { val: { a: 2, b: 4 }, picks: [2, 4] },
    ]);
  });

  it("doesn't generate alias property when defined", () => {
    const alias = arb.alias(() => {
      throw new Error("should not be called");
    });

    arb.object({
      a: arb.int(1, 2),
      b: alias,
    });
  });
});

describe("union", () => {
  it("requires at least one case", () => {
    assertThrows(
      () => arb.union<{ a: number }>(),
      Error,
      "union must have at least one case",
    );
  });

  it("chooses between two object shapes", () => {
    const example = arb.union<{ a: number } | { b: number }>(
      arb.object({ a: arb.int(1, 2) }),
      arb.object({ b: arb.int(3, 4) }),
    );

    assertGenerated(example, [
      { val: { a: 1 }, picks: [0, 1] },
      { val: { b: 3 }, picks: [1, 3] },
      { val: { a: 2 }, picks: [0, 2] },
      { val: { b: 4 }, picks: [1, 4] },
    ]);
  });
});