import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Arbitrary } from "../src/arbitraries.ts";
import * as arb from "../src/arbitraries.ts";

import { repeatTest } from "../src/runner.ts";

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
    }, { only: "-846394842:179" });
  });
});
