import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Arbitrary } from "../src/arbitraries.ts";
import * as arb from "../src/arbitraries.ts";

import { generateReps, repeatTest } from "../src/runner.ts";

describe("generateReps", () => {
  it("generates reps with the right keys", () => {
    const key = arb.record({ seed: arb.int32, index: arb.int(0, 100) });
    repeatTest(key, (start) => {
      const zero = new Arbitrary(() => 0);
      const test = () => {};
      const reps = generateReps(start, zero, test);
      for (let i = 0; i < 10; i++) {
        assertEquals(reps.next().value, {
          key: { seed: start.seed, index: start.index + i },
          arg: 0,
          test,
        });
      }
    });
  });
});

describe("repeatTest", () => {
  it("runs a test function the specified number of times", () => {
    for (let expected = 0; expected < 100; expected++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      const zero = new Arbitrary(() => 0);
      repeatTest(zero, increment, { reps: expected });
      assertEquals(actual, expected);
    }
  });
  it("runs only once when the 'only' option is set", () => {
    let actual = 0;
    const increment = () => {
      actual++;
    };
    const zero = new Arbitrary(() => 0);
    repeatTest(zero, increment, { reps: 100, only: "123:456" });
    assertEquals(actual, 1);
  });
  it("reproduces a previous test run when the 'only' option is set", () => {
    repeatTest(arb.int(0, 100), (i) => {
      assertEquals(i, 42);
    }, { only: "1866001691:205" });
  });
});
