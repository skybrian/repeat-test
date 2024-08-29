/**
 * Defines constraints on generated arrays.
 */
export type ArrayOpts = {
  length?: number | { min?: number; max?: number };
};

export function parseArrayOpts(
  opts: ArrayOpts | undefined,
): { min: number; max: number } {
  let min = 0;
  let max = 1000;
  if (typeof opts?.length === "number") {
    min = opts.length;
    max = opts.length;
  } else if (opts?.length !== undefined) {
    min = opts.length.min ?? 0;
    max = opts.length.max ?? 1000;
  }
  if (min > max) {
    throw new Error(
      `length constraint for array is invalid; want: min <= max, got: ${min}..${max}`,
    );
  }
  return { min, max };
}
