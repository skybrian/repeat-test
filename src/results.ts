/** A result that's tagged as a success. */
export type Success<T> = {
  readonly ok: true;
  readonly val: T;
};

/** A result that's tagged as a failure and has an error message. */
export type Failure = {
  readonly ok: false;
  readonly message: string;
};

export function success(): Success<undefined>;
export function success<T>(val: T): Success<T>;
export function success<T>(val?: T): Success<T | undefined> {
  return { ok: true, val };
}

export function failure(message: string): Failure {
  return { ok: false, message };
}

/** Distinguishes a finished result from one that's still in progress. */
export type Done<T> = Success<T> & { readonly done: true };

export function done<T>(val: T): Done<T> {
  return { ok: true, done: true, val };
}

const alwaysBuild = Symbol("alwaysBuild");

/**
 * A Done result that rebuilds the value after its first access.
 *
 * (For returning mutable objects.)
 */
export function cacheOnce<T>(val: T, build: () => T): Done<T> {
  let cache: T | typeof alwaysBuild = val;

  return {
    ok: true,
    done: true,
    get val() {
      if (cache === alwaysBuild) {
        return build();
      }
      const val = cache;
      cache = alwaysBuild;
      return val;
    },
  };
}
