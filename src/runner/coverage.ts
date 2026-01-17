/**
 * Coverage analysis for `sometimes()` and `checkOdds()` calls.
 */

import { AssertionError } from "@std/assert";
import type { Coverage, OddsChecks, SystemConsole } from "../console.ts";

/**
 * Z-score for 99.9% confidence interval (two-tailed).
 * This means ~0.1% false positive rate.
 */
const Z_SCORE = 3.29;

/**
 * Calculates the confidence interval for a binomial proportion.
 *
 * Uses the normal approximation, which is valid when n*p >= 5 and n*(1-p) >= 5.
 *
 * @returns [lower, upper] bounds of the confidence interval, or null if sample too small
 */
function binomialConfidenceInterval(
  n: number,
  p: number,
): [number, number] | null {
  // Check if normal approximation is valid
  if (n * p < 5 || n * (1 - p) < 5) {
    return null;
  }

  const se = Math.sqrt((p * (1 - p)) / n);
  const margin = Z_SCORE * se;
  const lower = Math.max(0, p - margin);
  const upper = Math.min(1, p + margin);

  // If interval spans [0, 1], it's too wide to be useful
  if (lower === 0 && upper === 1) {
    return null;
  }

  return [lower, upper];
}

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

type OddsCheckResult = {
  key: string;
  expectedProb: number;
  observedProb: number;
  n: number;
  ci: [number, number] | null;
  status: "pass" | "fail" | "skipped";
};

/**
 * Analyzes odds checks and throws if any observed proportion is outside
 * the confidence interval for the expected probability.
 *
 * @param oddsChecks - The odds check data collected during the test run
 * @param console - Where to log the summary
 */
export function analyzeOddsChecks(
  oddsChecks: OddsChecks,
  console: SystemConsole,
): void {
  const keys = Object.keys(oddsChecks);
  if (keys.length === 0) return;

  console.log(`checkOdds() summary:`);
  const results: OddsCheckResult[] = [];

  for (const key of keys) {
    const { expectedProb, trueCount, falseCount } = oddsChecks[key];
    const n = trueCount + falseCount;
    const observedProb = n === 0 ? 0 : trueCount / n;
    const ci = binomialConfidenceInterval(n, expectedProb);

    let status: "pass" | "fail" | "skipped";
    if (ci === null) {
      status = "skipped";
    } else if (observedProb >= ci[0] && observedProb <= ci[1]) {
      status = "pass";
    } else {
      status = "fail";
    }

    results.push({ key, expectedProb, observedProb, n, ci, status });

    const ciStr = ci ? `[${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]` : "n/a";
    const statusStr = status === "pass" ? "✓" : status === "fail" ? "✗" : "skipped";
    console.log(
      `  ${key}: expected=${expectedProb}, observed=${observedProb.toFixed(4)}, ` +
        `n=${n}, CI=${ciStr} ${statusStr}`,
    );
  }

  const failures = results.filter((r) => r.status === "fail");
  if (failures.length > 0) {
    throw new AssertionError(
      `checkOdds() failed for: ${failures.map((f) => {
        const ci = f.ci!;
        return `${f.key} (expected ${f.expectedProb}, observed ${f.observedProb.toFixed(4)}, ` +
          `outside CI [${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}])`;
      }).join(", ")}`,
    );
  }
}
