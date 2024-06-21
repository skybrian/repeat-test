export type Success<T> = {
  ok: true;
  val: T;
};

export function success<T>(val: T): Success<T> {
  return { ok: true, val };
}

export interface Failure {
  ok: false;
  message?: string;
}

export function fail(message: string): Failure {
  return { ok: false, message };
}
