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

/**
 * Options controlling the probabiity of getting each array length in the
 * variable-length part of an array.
 *
 * @param opts.startRegionSize the maximum length of the starting region
 * @param opts.minProbEmpty the minimum probability that the variable-length
 * region is omitted entirely.
 * @param opts.minProbFull the minimum probability that the array will have the
 * maximum possible length.
 */
export type ArrayLengthOpts = {
  startRegionSize?: number;
  minProbEmpty?: number;
  minProbFull?: number;
};

/**
 * Returns the biases for two coins for adding optional items to a
 * variable-length array.
 *
 * The variable-length part of the array if divided up into a *starting region*
 * and an *extended region.* A different biased coin is used for each.
 *
 * @param fullLength the maximum length of the variable-length part of the array
 * (both regions).
 */
export function arrayLengthBiases(
  fullLength: number,
  opts?: ArrayLengthOpts,
): [number, number] {
  const startRegionSize = opts?.startRegionSize ?? 100;
  const minProbEmpty = opts?.minProbEmpty ?? 0.01;
  const minProbFull = opts?.minProbFull ?? 0.01;
  assert(
    Math.pow(1 - minProbEmpty, startRegionSize) >= minProbFull,
    "full-size array is too improbable, given constraints",
  );

  const probFull = Math.max(1 / (fullLength + 1), minProbFull);

  const startBias = Math.min(
    calculateBias(1.0, probFull, fullLength),
    1 - minProbEmpty,
  );

  if (fullLength <= startRegionSize) {
    // Second coin isn't needed.
    return [startBias, startBias];
  }

  const probEnteredExtendedRegion = Math.pow(startBias, startRegionSize);
  const extendedRegionSize = fullLength - startRegionSize;
  const extendedBias = calculateBias(
    probEnteredExtendedRegion,
    probFull,
    extendedRegionSize,
  );

  return [startBias, extendedBias];
}
