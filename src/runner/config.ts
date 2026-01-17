/**
 * Global configuration for the test runner, including environment variable handling.
 */

/** Default number of random repetitions per test. */
export const defaultReps = 1000;

/** Default limit on picks (random integers) per generated value. */
export const maxPicksDefault = 10_000;

/**
 * Reads a positive integer from an environment variable.
 * Returns undefined if not set, not a valid positive integer, or if
 * environment access is not permitted.
 */
function readPositiveIntEnv(name: string): number | undefined {
  try {
    const envVal = Deno.env.get(name);
    if (envVal !== undefined) {
      const n = parseInt(envVal, 10);
      if (Number.isInteger(n) && n > 0) {
        return n;
      }
    }
  } catch {
    // Permission denied - env access not allowed, silently ignore
  }
  return undefined;
}

/**
 * Reads the QUICKREPS environment variable.
 *
 * When set, tests run with fewer repetitions and skip `sometimes()` validation.
 * Useful for quick smoke tests during development.
 */
export function getQuickReps(): number | undefined {
  return readPositiveIntEnv("QUICKREPS");
}

/**
 * Reads the MULTIREPS environment variable.
 *
 * When set, tests run with more repetitions (baseline × MULTIREPS) and
 * perform coverage analysis on `sometimes()` calls to detect rarely-hit branches.
 */
export function getMultiReps(): number | undefined {
  return readPositiveIntEnv("MULTIREPS");
}
