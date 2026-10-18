import assert from "node:assert/strict";
import { type Domain, Gen } from "@skybrian/repeat-test/core";

/**
 * Checks both the error's class and a message substring. Unlike Node's third
 * throws() argument, messageIncludes matches the thrown error, not the assertion.
 */
export function assertThrows(
  run: () => unknown,
  expectedClass: abstract new (...args: never[]) => Error = Error,
  messageIncludes?: string,
): Error {
  let caught: Error | undefined;
  assert.throws(run, (error: unknown) => {
    assert.ok(
      error instanceof expectedClass,
      `expected an instance of ${expectedClass.name}`,
    );
    if (messageIncludes !== undefined) {
      assert.ok(
        error.message.includes(messageIncludes),
        `expected ${JSON.stringify(error.message)} to include ${
          JSON.stringify(messageIncludes)
        }`,
      );
    }
    caught = error;
    return true;
  });
  assert.ok(caught);
  return caught;
}

/** Checks that parsing a value into picks and rebuilding preserves the value. */
export function assertRoundTrip<T>(domain: Domain<T>, value: T): void {
  const picks = domain.pickify(value, "can't pickify value");
  assert.ok(picks.ok, picks.ok ? undefined : picks.message);

  const gen = Gen.build(domain, picks.val);
  assert.ok(gen.ok, gen.ok ? undefined : gen.message);
  assert.deepStrictEqual(gen.val, value, "regenerated value didn't match");
}
