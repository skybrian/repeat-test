import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import TestRunner from "../src/simple_runner.ts";
import { Arbitrary } from "../mod.ts";

describe("TestRunner", () => {
  describe("repeatTest", () => {
    it("runs the test function the specified number of times", () => {
      const runner = new TestRunner();
      for (let expected = 0; expected < 100; expected++) {
        let actual = 0;
        const increment = () => {
          actual++;
        };
        const zero = new Arbitrary(() => 0);
        runner.repeat(zero, increment, { reps: expected });
        assertEquals(actual, expected);
      }
    });
  });
});
