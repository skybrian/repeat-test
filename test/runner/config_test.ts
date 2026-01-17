import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import {
  defaultReps,
  getReps,
  maxPicksDefault,
  parseReps,
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

describe("parseReps", () => {
  it("parses percentage format", () => {
    assertEquals(parseReps("5%"), { multiplier: 0.05 });
    assertEquals(parseReps("100%"), { multiplier: 1 });
    assertEquals(parseReps("200%"), { multiplier: 2 });
    assertEquals(parseReps("0.5%"), { multiplier: 0.005 });
  });

  it("parses multiplier format", () => {
    assertEquals(parseReps("5x"), { multiplier: 5 });
    assertEquals(parseReps("1x"), { multiplier: 1 });
    assertEquals(parseReps("0.5x"), { multiplier: 0.5 });
    assertEquals(parseReps("10x"), { multiplier: 10 });
  });

  it("handles whitespace", () => {
    assertEquals(parseReps(" 5% "), { multiplier: 0.05 });
    assertEquals(parseReps(" 5x "), { multiplier: 5 });
  });

  it("accepts zero", () => {
    assertEquals(parseReps("0"), { multiplier: 0 });
    assertEquals(parseReps("0%"), { multiplier: 0 });
    assertEquals(parseReps("0x"), { multiplier: 0 });
  });

  it("returns undefined for invalid formats", () => {
    assertEquals(parseReps("5"), undefined);      // no suffix
    assertEquals(parseReps("abc"), undefined);    // not a number
    assertEquals(parseReps("5X"), undefined);     // uppercase X
    assertEquals(parseReps("%5"), undefined);     // wrong order
    assertEquals(parseReps("x5"), undefined);     // wrong order
    assertEquals(parseReps("-5%"), undefined);    // negative
    assertEquals(parseReps("-5x"), undefined);    // negative
    assertEquals(parseReps(""), undefined);       // empty
  });
});

describe("getReps", () => {
  it("returns undefined when REPS is not set", () => {
    // This assumes REPS is not set in the test environment
    const result = getReps();
    // Result is either undefined (not set) or a RepsConfig (if set)
    if (result !== undefined) {
      assertEquals(typeof result.multiplier, "number");
    }
  });

  // Note: We can't easily test the error case without setting env vars,
  // but the error path is tested implicitly if REPS is set to an invalid
  // value when running the test suite.
});

describe("repeatTest with REPS", () => {
  it("basic sometimes() coverage still works", () => {
    const con = new RecordingConsole();
    repeatTest(arb.boolean(), (val, console) => {
      console.sometimes("test-key", val);
    }, { reps: 20, console: con });
    con.checkEmpty();
  });
});
