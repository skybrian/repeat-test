import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";
import { AssertionError } from "@std/assert";

import { analyzeCoverage } from "../../src/runner/coverage.ts";
import type { Coverage } from "../../src/console.ts";
import { RecordingConsole } from "../../src/console.ts";

describe("analyzeCoverage", () => {
  it("does nothing for empty coverage", () => {
    const con = new RecordingConsole();
    analyzeCoverage({}, 0.1, 10, con, 100);
    con.checkEmpty();
  });

  it("logs summary for coverage data", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "my-key": { true: 50, false: 50 },
    };
    analyzeCoverage(coverage, 0.1, 10, con, 100);
    con.logged("sometimes() coverage summary for 100 reps:");
    con.logged("  my-key: true: 50, false: 50, p(true)≈0.5000 (n=100)");
    con.checkEmpty();
  });

  it("passes when both branches are well-covered", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "balanced": { true: 45, false: 55 },
    };
    // threshold 0.1 means both p(true) and p(false) must be >= 0.1
    analyzeCoverage(coverage, 0.1, 10, con, 100);
    // Should not throw
  });

  it("throws when p(true) is below threshold", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "rarely-true": { true: 1, false: 99 },
    };
    // p(true) = 0.01, threshold = 0.1
    assertThrows(
      () => analyzeCoverage(coverage, 0.1, 10, con, 100),
      AssertionError,
      "sometimes() coverage below threshold for keys: rarely-true",
    );
  });

  it("throws when p(false) is below threshold", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "rarely-false": { true: 99, false: 1 },
    };
    // p(false) = 0.01, threshold = 0.1
    assertThrows(
      () => analyzeCoverage(coverage, 0.1, 10, con, 100),
      AssertionError,
      "sometimes() coverage below threshold for keys: rarely-false",
    );
  });

  it("skips threshold check when n < minRepsForStats", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "low-sample": { true: 1, false: 4 }, // n=5, p(true)=0.2
    };
    // minRepsForStats=10, so this key won't be checked against threshold
    analyzeCoverage(coverage, 0.3, 10, con, 100);
    // Should not throw even though p(true)=0.2 < threshold=0.3
  });

  it("reports multiple low-coverage keys", () => {
    const con = new RecordingConsole();
    const coverage: Coverage = {
      "key1": { true: 1, false: 99 },
      "key2": { true: 98, false: 2 },
    };
    assertThrows(
      () => analyzeCoverage(coverage, 0.1, 10, con, 100),
      AssertionError,
      "sometimes() coverage below threshold for keys: key1, key2",
    );
  });

  it("passes keys that are exactly 0 or 1 probability", () => {
    const con = new RecordingConsole();
    // If p(true) = 0, it means "never true" which is caught by the
    // main sometimes() check in runReps, not analyzeCoverage.
    // analyzeCoverage only checks for "rarely but not never" cases.
    const coverage: Coverage = {
      "always-true": { true: 100, false: 0 },
      "always-false": { true: 0, false: 100 },
    };
    // These should pass because probTrue=1 means (1-probTrue)=0 which is
    // not > 0, so the rarely-false check doesn't trigger.
    // Similarly probTrue=0 is not > 0 so rarely-true doesn't trigger.
    analyzeCoverage(coverage, 0.1, 10, con, 100);
  });
});
