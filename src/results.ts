/** A tagged, successful result. */
export type Success<T> = {
  ok: true;
  val: T;
};

/** A tagged, failed result. */
export interface Failure {
  /** Tag indicating that this is a failure. */
  ok: false;
  /** An error message. */
  message: string;
}

export function success(): Success<undefined>;
export function success<T>(val: T): Success<T>;
export function success<T>(val?: T): Success<T | undefined> {
  return { ok: true, val };
}

export function failure(message: string): Failure {
  return { ok: false, message };
}
