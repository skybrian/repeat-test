import { describe, it } from "@std/testing/bdd";
import { arb, type Arbitrary, repeatTest } from "@/mod.ts";

import { arrayLengthBiases, calculateBias } from "../src/math.ts";
import { assertAlmostEquals } from "@std/assert/almost-equals";
import { assert } from "@std/assert";

const divs = 10000;

function probability(min: number, max: number): Arbitrary<number> {
  return arb.int(Math.floor(min * divs), Math.ceil(max * divs)).map((n) =>
    n / divs
  );
}

describe("calculateBias", () => {
  it("returns any probability for zero flips and start and are the same", () => {
    const actual = calculateBias(1.0, 1.0, 0);
    assert(actual >= 0 && actual <= 1);
  });

  it("calculates the bias needed for at least one flip", () => {
    const example = arb.from((pick) => {
      const gap = pick(probability(0.01, 0.99));
      const start = pick(probability(gap + 0.01, 1));
      const reps = pick(arb.int(1, 10000));
      return { start, gap, reps };
    });

    repeatTest(
      example,
      ({ start, gap, reps }, console) => {
        const end = start - gap;
        console.log(start, "=>", end);

        const bias = calculateBias(start, end, reps);
        console.log("bias", bias);

        // Simulate the coin flips
        const actualEnd = start * Math.pow(bias, reps);

        assertAlmostEquals(actualEnd, end);
      },
    );
  });
});

describe("arrayLengthBiases", () => {
  it("calculates the biases for default options", () => {
    const [start, end] = arrayLengthBiases(1000);
    assertAlmostEquals(start, 0.99);
    assertAlmostEquals(end, 0.9960078);
  });
});
