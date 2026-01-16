/**
 * Recursively freezes an object and all nested objects/arrays.
 *
 * This is useful when creating test examples that need to be immutable.
 * Unlike `Object.freeze`, this freezes nested objects too.
 *
 * @example
 * ```ts
 * import { frozen, repeatTest } from "@skybrian/repeat-test";
 *
 * repeatTest([frozen({ a: { x: 1 } }), frozen({ b: { x: 2 } })], (obj) => {
 *   // obj and all nested properties are frozen
 * });
 * ```
 */
export function frozen<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      frozen(value);
    }
  }
  return Object.freeze(obj);
}
