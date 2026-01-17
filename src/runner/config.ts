/**
 * Global configuration for the test runner, including environment variable handling.
 */

/** Default number of random repetitions per test. */
export const defaultReps = 1000;

/** Default limit on picks (random integers) per generated value. */
export const maxPicksDefault = 10_000;

/**
 * Configuration from the REPS environment variable.
 */
export type RepsConfig = {
  /**
   * Multiplier applied to baseline rep count.
   * e.g., 0.05 for "5%", 5.0 for "5x"
   */
  multiplier: number;
};

/**
 * Parses a REPS value string.
 *
 * Supported formats:
 * - Percentage: "5%" means 5% of baseline (multiplier = 0.05)
 * - Multiplier: "5x" means 5× baseline (multiplier = 5.0)
 *
 * @returns RepsConfig if valid, undefined if invalid format
 */
export function parseReps(value: string): RepsConfig | undefined {
  const trimmed = value.trim();
  if (trimmed === "0") {
    // Special case: "0" is unambiguous (0% and 0x are the same)
    return { multiplier: 0 };
  } else if (trimmed.endsWith("%")) {
    const n = parseFloat(trimmed.slice(0, -1));
    if (isFinite(n) && n >= 0) {
      return { multiplier: n / 100 };
    }
  } else if (trimmed.endsWith("x")) {
    const n = parseFloat(trimmed.slice(0, -1));
    if (isFinite(n) && n >= 0) {
      return { multiplier: n };
    }
  }
  return undefined;
}

/**
 * Cached REPS configuration, validated once at module load time.
 * - undefined: REPS not set or env access denied
 * - RepsConfig: valid REPS value
 * If REPS is set but invalid, an error is thrown at module load time.
 */
const repsConfigFromEnv: RepsConfig | undefined = (() => {
  let envVal: string | undefined;
  try {
    envVal = Deno.env.get("REPS");
  } catch {
    // Permission denied - env access not allowed, silently ignore
    return undefined;
  }

  if (envVal === undefined) {
    return undefined;
  }

  const config = parseReps(envVal);
  if (config === undefined) {
    throw new Error(
      `Invalid REPS value: "${envVal}". ` +
        `Use percentage (e.g., "5%") or multiplier (e.g., "5x") format.`,
    );
  }
  return config;
})();

/**
 * Override for REPS config, used internally for testing.
 * When set, this takes precedence over the environment variable.
 */
let repsConfigOverride: RepsConfig | undefined | null = null;

/**
 * Returns the REPS environment variable configuration.
 *
 * The REPS variable controls how many repetitions to run relative to the
 * baseline (default 1000, or opts.reps if specified):
 *
 * - `REPS=5%` - Run 5% of baseline reps, skip sometimes() validation
 * - `REPS=5x` - Run 5× baseline reps, enable coverage threshold analysis
 * - `REPS=100%` or `REPS=1x` - Normal behavior (same as not setting REPS)
 *
 * When multiplier < 1: sometimes() validation is skipped (quick mode)
 * When multiplier > 1: coverage threshold analysis is enabled (deep mode)
 *
 * The value is validated once at module load time. If REPS is set but invalid,
 * an error is thrown immediately (before any tests run).
 *
 * @returns RepsConfig if set and valid, undefined otherwise
 */
export function getReps(): RepsConfig | undefined {
  if (repsConfigOverride !== null) {
    return repsConfigOverride;
  }
  return repsConfigFromEnv;
}

/**
 * Sets an override for the REPS configuration.
 * Used internally for testing to ensure tests run with expected behavior
 * regardless of the REPS environment variable.
 *
 * @param config - The config to use, or undefined to disable REPS, or null to clear override
 */
export function setRepsForTesting(config: RepsConfig | undefined | null): void {
  repsConfigOverride = config;
}
