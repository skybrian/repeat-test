import { assert } from "@std/assert/assert";

/**
 * Calculates the bias needed for repeated coin flips.
 *
 * @param start the starting probability
 * @param end the probability of getting heads n times
 * @param n the number of coin flips
 *
 * @returns the bias needed (probability of getting heads).
 */
export function calculateBias(start: number, end: number, n: number): number {
  assert((start >= 0) && (start <= 1));
  assert((end >= 0) && (end <= 1));
  if (n === 0 && start === end) {
    return 0.5; // doesn't matter; won't be used for zero flips
  }

  assert(end <= start);
  assert(n >= 1);
  return Math.pow(end / start, 1 / n);
}
