import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import {
  assertFirstGenerated,
  assertFirstValues,
  assertValues,
} from "../lib/asserts.ts";

import { repeatTest } from "@/runner.ts";
import * as arb from "@/arbs.ts";
import { generateDefault } from "../../src/ordered.ts";

describe("array", () => {
  const bools = arb.array(arb.boolean());

  describe("sometimes generates short and max lengths", () => {
    it("by default", () => {
      repeatTest(bools, (arr, console) => {
        for (let len = 0; len < 20; len++) {
          console.sometimes(`length is ${len}`, arr.length === len);
        }
        console.sometimes(`length is 1000`, arr.length === 1000);
      });
    });

    it("for 10k", () => {
      repeatTest(
        arb.array(arb.boolean(), { length: { max: 10000 } }),
        (arr, console) => {
          for (let len = 0; len < 20; len++) {
            console.sometimes(`length is ${len}`, arr.length === len);
          }
          console.sometimes(`length is 10000`, arr.length === 10000);
        },
        { maxPicks: 20000 },
      );
    });
  });

  describe("of booleans", () => {
    describe("generateAll", () => {
      it("returns each combination in increasing order", () => {
        assertFirstGenerated(bools, [
          { val: [], picks: [0] },
          { val: [false], picks: [1, 0, 0] },
          { val: [true], picks: [1, 1, 0] },
          { val: [false, false], picks: [1, 0, 1, 0, 0] },
          { val: [true, false], picks: [1, 1, 1, 0, 0] },
          { val: [false, true], picks: [1, 0, 1, 1, 0] },
          { val: [true, true], picks: [1, 1, 1, 1, 0] },
        ]);
      });
    });
  });

  describe("of unsigned ints", () => {
    const ints = arb.array(arb.int(0, 2 ** 32));
    it("defaults to an empty array", () => {
      assertEquals(generateDefault(ints).val, []);
    });
    describe("examples", () => {
      it("returns each combination in increasing order", () => {
        assertFirstValues(ints, [
          [],
          [0],
          [1],
          [0, 0],
          [1, 0],
          [2],
          [2, 0],
          [0, 1],
        ]);
      });
    });
  });

  describe("with a minimum length", () => {
    const bools = arb.array(arb.boolean(), { length: { min: 3 } });
    it("defaults to the minimum length", () => {
      assertEquals(generateDefault(bools).val, [false, false, false]);
    });
  });

  describe("with a maximum length", () => {
    const bools = arb.array(arb.boolean(), { length: { max: 1 } });
    it("generates arrays within that length", () => {
      assertValues(bools, [
        [],
        [false],
        [true],
      ]);
    });
  });

  describe("with a fixed length", () => {
    const bools = arb.array(arb.boolean(), { length: 2 });
    it("generates arrays of that length", () => {
      assertValues(bools, [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]);
    });
  });

  it("throws an Error if min > max", () => {
    assertThrows(
      () => arb.array(arb.boolean(), { length: { min: 3, max: 2 } }),
      Error,
      "length constraint for array is invalid; want: min <= max, got: 3..2",
    );
  });
});
