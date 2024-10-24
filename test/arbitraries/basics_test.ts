import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  assertFirstGenerated,
  assertFirstValues,
  assertGenerated,
  assertValues,
} from "../lib/asserts.ts";

import { filtered } from "../../src/results.ts";
import { repeatTest } from "@/runner.ts";
import { Arbitrary } from "@/arbitrary.ts";
import * as arb from "@/arbs.ts";
import { generate } from "../../src/gen_class.ts";
import { onePlayout } from "../../src/backtracking.ts";
import { randomPicker } from "../../src/random.ts";
import { generateDefault } from "../../src/ordered.ts";

describe("boolean", () => {
  it("is sometimes true", () => {
    repeatTest(arb.boolean(), (val, console) => {
      console.sometimes("true", val);
    });
  });
  it("generates both values", () => {
    assertGenerated(arb.boolean(), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("has maxSize set to 2", () => {
    assertEquals(arb.boolean().maxSize, 2);
  });
  it("has a name", () => {
    assertEquals(arb.boolean().name, "boolean");
  });
});

describe("biased", () => {
  it("generates the same values as boolean", () => {
    assertGenerated(arb.biased(0.9), [
      { val: false, picks: [0] },
      { val: true, picks: [1] },
    ]);
  });
  it("always picks true for probability 1", () => {
    repeatTest(arb.biased(1), (val) => {
      assertEquals(val, true);
    });
  });
  it("always picks false for probability 0", () => {
    repeatTest(arb.biased(0), (val) => {
      assertEquals(val, false);
    });
  });
  it("almost always picks false for a very small probability", () => {
    const samples = arb.array(arb.biased(0.0000001), { length: 100 });
    const wrapped = Arbitrary.from((pick) => {
      const result = pick(samples);
      pick(arb.int(1, 10000000)); // prevent backtracking
      return result;
    });
    const gen = generate(wrapped, onePlayout(randomPicker(123)));
    assert(gen !== filtered);
    const falseCount = gen.val.filter((val) => val === false).length;
    assertEquals(falseCount, 100);
  });
  it("has maxSize set to 2", () => {
    assertEquals(arb.biased(0.9).maxSize, 2);
  });
  it("has a default name", () => {
    assertEquals(arb.biased(0.9).name, "biased boolean");
  });
  it("accepts a custom name", () => {
    assertEquals(arb.biased(0.9).with({ name: "my name" }).name, "my name");
  });
  it("throws if given an invalid probability", () => {
    assertThrows(() => arb.biased(-0.1), Error);
  });
});

describe("int", () => {
  describe("examples", () => {
    it("includes positive numbers within range", () => {
      assertValues(arb.int(1, 6), [1, 2, 3, 4, 5, 6]);
    });
    it("includes negative numbers within range", () => {
      assertValues(arb.int(-3, -2), [-2, -3]);
    });
    it("includes positive and negative numbers within range", () => {
      assertValues(arb.int(-3, 3), [0, -1, 1, -2, 2, -3, 3]);
    });
  });
  describe("default", () => {
    it("defaults to min for positive numbers", () => {
      assertEquals(generateDefault(arb.int(1, 6)).val, 1);
    });
    it("defaults to max for negative numbers", () => {
      assertEquals(generateDefault(arb.int(-6, -1)).val, -1);
    });
    it("defaults to 0 for a range that includes 0", () => {
      assertEquals(generateDefault(arb.int(-6, 6)).val, 0);
    });
  });
  describe("maxSize", () => {
    it("has maxSize set to the size of the range", () => {
      assertEquals(arb.int(1, 6).maxSize, 6);
    });
  });
  it("has a name", () => {
    assertEquals(arb.int(1, 6).name, "int(1, 6)");
    assertEquals(arb.int(-6, -1).name, "int(-6, -1)");
    assertEquals(arb.int(-6, 6).name, "int(-6, 6)");
  });
});

describe("record", () => {
  describe("for an empty record shape", () => {
    const empty = arb.record({});
    it("creates empty records", () => {
      assertGenerated(empty, [
        { val: {}, picks: [] },
      ]);
      assertEquals(empty.maxSize, 1);
    });
  });
  describe("for a constant record shape", () => {
    const example = arb.record({
      a: arb.of(1),
      b: arb.of(2),
    });
    it("doesn't make any picks", () => {
      assertGenerated(example, [
        { val: { a: 1, b: 2 }, picks: [] },
      ]);
    });
  });
  describe("for a record with a single field", () => {
    const oneField = arb.record({
      a: arb.int(1, 2),
    });
    it("defaults to the default value of the field", () => {
      assertEquals(generateDefault(oneField).val, { a: 1 });
    });
    it("makes one pick", () => {
      assertGenerated(oneField, [
        { val: { a: 1 }, picks: [1] },
        { val: { a: 2 }, picks: [2] },
      ]);
    });
  });
  describe("for a record with mutiple fields", () => {
    const example = arb.record({
      a: arb.int(1, 2),
      b: arb.int(3, 4),
    });
    it("reads picks ordered by the keys", () => {
      assertGenerated(example, [
        { val: { a: 1, b: 3 }, picks: [1, 3] },
        { val: { a: 2, b: 3 }, picks: [2, 3] },
        { val: { a: 1, b: 4 }, picks: [1, 4] },
        { val: { a: 2, b: 4 }, picks: [2, 4] },
      ]);
    });
  });
});

describe("oneOf", () => {
  const oneWay = arb.oneOf(
    arb.int(1, 2),
  );
  const threeWay = arb.oneOf(
    arb.int(1, 2),
    arb.int(3, 4),
    arb.int(5, 6),
  );
  it("defaults to the first branch", () => {
    assertEquals(generateDefault(oneWay).val, 1);
    assertEquals(generateDefault(threeWay).val, 1);
  });
});

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
