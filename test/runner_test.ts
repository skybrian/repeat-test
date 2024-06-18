import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Arbitrary } from "../mod.ts";

import { repeatTest } from "../src/runner.ts";

describe("TestRunner", () => {
  describe("repeatTest", () => {
    it("runs the test function the specified number of times", () => {
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
  });
});
