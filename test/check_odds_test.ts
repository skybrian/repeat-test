import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { assertStringIncludes } from "@std/assert";
import { arb, repeatTest } from "../src/entrypoints/mod.ts";
import { setRepsForTesting } from "../src/runner/config.ts";
import { RecordingConsole } from "../src/console.ts";

describe("checkOdds", () => {
  beforeEach(() => {
    // Enable coverage analysis mode (simulates REPS > 1)
    setRepsForTesting({ multiplier: 5 });
  });

  afterEach(() => {
    setRepsForTesting(null);
  });

  it("passes when observed probability matches expected", () => {
    const con = new RecordingConsole();
    // Use int range so we get many unique values
    repeatTest(arb.int(0, 10000), (val, console) => {
      console.checkOdds("even number", 0.5, val % 2 === 0);
    }, { reps: 200, console: con });
    // Should not throw
  });

  it("fails when observed probability is far from expected", () => {
    const con = new RecordingConsole();
    let error: Error | undefined;
    try {
      repeatTest(arb.int(0, 10000), (val, console) => {
        // Claim probability should be 0.9 but it's actually 0.5
        console.checkOdds("biased coin", 0.9, val % 2 === 0);
      }, { reps: 200, console: con });
    } catch (e) {
      error = e as Error;
    }
    if (!error) {
      // Print what was logged to help debug
      console.log("Recorded messages:", con.messages);
      throw new Error("Expected checkOdds to fail but it did not throw");
    }
    assertStringIncludes(error.message, "checkOdds() failed");
  });

  it("skips check when sample size is too small for the expected probability", () => {
    const con = new RecordingConsole();
    // With p=0.001, need n >= 5000 for the check to be valid (n*p >= 5)
    // With only 200 reps, check should be skipped
    repeatTest(arb.int(0, 10000), (val, console) => {
      console.checkOdds("rare event", 0.001, val === 42);
    }, { reps: 200, console: con });
    // Should not throw even though observed is likely 0 which is far from 0.001
  });

  it("works with biased condition", () => {
    const con = new RecordingConsole();
    // val % 10 === 0 is true 10% of the time (0, 10, 20, ... out of 0-9999)
    repeatTest(arb.int(0, 9999), (val, console) => {
      console.checkOdds("divisible by 10", 0.1, val % 10 === 0);
    }, { reps: 200, console: con });
    // Should not throw
  });

  it("fails when expected probability is wrong", () => {
    const con = new RecordingConsole();
    let error: Error | undefined;
    try {
      // val % 10 === 0 is true 10% of the time, but we claim 50%
      repeatTest(arb.int(0, 9999), (val, console) => {
        console.checkOdds("divisible by 10", 0.5, val % 10 === 0);
      }, { reps: 200, console: con });
    } catch (e) {
      error = e as Error;
    }
    if (!error) {
      console.log("Recorded messages:", con.messages);
      throw new Error("Expected checkOdds to fail but it did not throw");
    }
    assertStringIncludes(error.message, "checkOdds() failed");
  });

  it("fails when all values are exhausted before enough samples", () => {
    const con = new RecordingConsole();
    let error: Error | undefined;
    try {
      // arb.boolean() only has 2 values, so the test will exhaust quickly
      // and checkOdds won't have enough samples
      repeatTest(arb.boolean(), (val, console) => {
        console.checkOdds("true", 0.5, val);
      }, { reps: 1000, console: con });
    } catch (e) {
      error = e as Error;
    }
    if (!error) {
      console.log("Recorded messages:", con.messages);
      throw new Error("Expected checkOdds to fail due to insufficient samples");
    }
    assertStringIncludes(error.message, "insufficient samples");
    assertStringIncludes(error.message, "n=2");
  });
});
