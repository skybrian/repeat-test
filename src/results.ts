/** A result that's tagged as a success. */
export type Success<T> = {
  readonly ok: true;
  readonly val: T;
};

/** A result that's tagged as a failure and has an error message. */
export type Failure = {
  readonly ok: false;
  readonly message: string;
  /** For a validation error, the value that had the error. */
  readonly actual?: unknown;
};

export function success(): Success<undefined>;
export function success<T>(val: T): Success<T>;
export function success<T>(val?: T): Success<T | undefined> {
  return { ok: true, val };
}

export function failure(message: string, actual?: unknown): Failure {
  return { ok: false, message, actual };
}

/**
 * Indicates that no value is available due to being rejected by a filter.
 *
 * To pass the filter, the request should be retried with different picks.
 */
export const filtered = Symbol("filtered");
