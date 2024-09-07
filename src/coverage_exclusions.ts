// This file contains functions that intentionally not covered by repeat-test's
// test suite.

export function stopInDebugger() {
  // deno coverage will hang if you use a debugger statement.
  // See:  https://github.com/denoland/deno/issues/17462
  // So, we should never call this function in repeat-test's tests.

  // deno-lint-ignore no-debugger
  debugger;
}
