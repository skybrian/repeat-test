import type { PickSet } from "./generated.ts";

/**
 * Specifies a record to be generated.
 *
 * Each field will be independently generated.
 */
export type RecordShape<T> = {
  [K in keyof T]: PickSet<T[K]>;
};

/**
 * A callback for reporting errors while validating a value.
 *
 * The 'at' argument is an optional string or number that identifies where the
 * error occurred, such as an array index or a property name.
 */
export type SendErr = (msg: string, opts?: { at: string | number }) => void;

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

export function checkArray(
  val: unknown,
  min: number,
  max: number,
  sendErr: SendErr,
): val is unknown[] {
  if (!Array.isArray(val)) {
    sendErr("not an array");
    return false;
  } else if (val.length < min) {
    sendErr(`array too short; want len >= ${min}, got: ${val.length}`);
    return false;
  } else if (val.length > max) {
    sendErr(`array too long; want len <= ${max}, got: ${val.length}`);
    return false;
  }
  return true;
}

/**
 * Constraints used when generating or validating tables.
 */
export type TableOpts<T extends Record<string, unknown>> = ArrayOpts & {
  keys?: (keyof T & string)[];
};
