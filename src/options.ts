/**
 * A callback for reporting errors while validating a value.
 *
 * The `actual` parameter is the invalid value.
 *
 * The 'at' parameter is an optional string or number that identifies the
 * location of the invalid value, such as an array index or a property name.
 */
export type SendErr = (
  msg: string,
  actual: unknown,
  opts?: { at: string | number },
) => void;

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
    sendErr("not an array", val);
    return false;
  } else if (val.length < min) {
    sendErr(`array too short; want len >= ${min}, got: ${val.length}`, val);
    return false;
  } else if (val.length > max) {
    sendErr(`array too long; want len <= ${max}, got: ${val.length}`, val);
    return false;
  }
  return true;
}
