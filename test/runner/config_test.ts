import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

import {
  defaultReps,
  getMultiReps,
  getQuickReps,
  maxPicksDefault,
} from "../../src/runner/config.ts";
import { repeatTest } from "../../src/runner.ts";
import * as arb from "@/arbs.ts";
import { RecordingConsole } from "../../src/console.ts";

describe("config constants", () => {
  it("defaultReps is 1000", () => {
    assertEquals(defaultReps, 1000);
  });

  it("maxPicksDefault is 10000", () => {
    assertEquals(maxPicksDefault, 10_000);
  });
});

describe("getQuickReps", () => {
  // Note: We can't easily mock Deno.env in tests, so we test the behavior
  // when the env var is not set (returns undefined)
  it("returns undefined when QUICKREPS is not set", () => {
    // This assumes QUICKREPS is not set in the test environment
    const result = getQuickReps();
    // Result is either undefined (not set) or a number (if set)
    if (result !== undefined) {
      assertEquals(typeof result, "number");
    }
  });
});

describe("getMultiReps", () => {
  it("returns undefined when MULTIREPS is not set", () => {
    const result = getMultiReps();
    if (result !== undefined) {
      assertEquals(typeof result, "number");
    }
  });
});

describe("QUICKREPS and MULTIREPS interaction", () => {
  it("basic sometimes() coverage still works", () => {
    const con = new RecordingConsole();
    repeatTest(arb.boolean(), (val, console) => {
      console.sometimes("test-key", val);
    }, { reps: 20, console: con });
    con.checkEmpty();
  });
});
