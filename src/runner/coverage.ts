/**
 * Coverage analysis for `sometimes()` calls in MULTIREPS mode.
 */

import { AssertionError } from "@std/assert";
import type { Coverage, SystemConsole } from "../console.ts";

type LowCoverageEntry = {
  key: string;
  nTrue: number;
  nFalse: number;
  probTrue: number;
  issue: "rarely true" | "rarely false";
};

/**
 * Analyzes coverage data from `sometimes()` calls and throws if any
 * branch has probability below the threshold.
 *
 * @param coverage - The coverage data collected during the test run
 * @param coverageThreshold - Minimum probability for each branch (true/false)
 * @param minRepsForStats - Minimum observations needed before checking threshold
 * @param console - Where to log the coverage summary
 * @param totalReps - Total number of reps run (for display)
 */
export function analyzeCoverage(
  coverage: Coverage,
  coverageThreshold: number,
  minRepsForStats: number,
  console: SystemConsole,
  totalReps: number,
): void {
  const keys = Object.keys(coverage);
  if (keys.length === 0) return;

  console.log(`sometimes() coverage summary for ${totalReps} reps:`);
  const lowCoverage: LowCoverageEntry[] = [];

  for (const key of keys) {
    const { true: nTrue, false: nFalse } = coverage[key];
    const n = nTrue + nFalse;
    const probTrue = n === 0 ? 0 : nTrue / n;
    console.log(
      `  ${key}: true: ${nTrue}, false: ${nFalse}, p(true)≈${probTrue.toFixed(4)} (n=${n})`,
    );

    if (n >= minRepsForStats) {
      if (probTrue > 0 && probTrue < coverageThreshold) {
        lowCoverage.push({ key, nTrue, nFalse, probTrue, issue: "rarely true" });
      } else if (probTrue < 1 && (1 - probTrue) < coverageThreshold) {
        lowCoverage.push({ key, nTrue, nFalse, probTrue, issue: "rarely false" });
      }
    }
  }

  if (lowCoverage.length > 0) {
    console.log(
      `sometimes() coverage below threshold (< ${coverageThreshold.toFixed(6)}):`,
    );
    for (const entry of lowCoverage) {
      const prob = entry.issue === "rarely true" ? entry.probTrue : 1 - entry.probTrue;
      console.log(
        `  ${entry.key}: ${entry.issue}, p=${prob.toFixed(6)} (true: ${entry.nTrue}, false: ${entry.nFalse})`,
      );
    }
    throw new AssertionError(
      `sometimes() coverage below threshold for keys: ${lowCoverage.map((e) => e.key).join(", ")}`,
    );
  }
}
