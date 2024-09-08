import { stopInDebugger } from "./coverage_exclusions.ts";

/**
 * The global console methods that are used in a {@link TestConsole}.
 *
 * See {@link https://developer.mozilla.org/en-US/docs/Web/API/console} MDN for
 * more about the console object.
 */
export interface SystemConsole {
  /**
   * Writes a message to the console at "log" log level.
   */
  log(...data: unknown[]): void;

  /**
   * Writes a message to the console at "error" log level.
   */
  error(...data: unknown[]): void;
}

/**
 * Provides methods to property tests that are useful for debugging.
 */
export interface TestConsole extends SystemConsole {
  /**
   * If the test is expected to fail, writes a message to console at "error" log level.
   */
  log(...data: unknown[]): void;

  /**
   * If the test is expected to fail, writes a message to console at "error" log level.
   *
   * Also forces the test to fail.
   */
  error(...data: unknown[]): void;

  /**
   * If the test is expected to fail, executes a debugger statement.
   */
  debugger(): void;

  /**
   * Asserts that given value is sometimes true and sometimes false, possibly in
   * different repetitions of a test.
   */
  assertSometimes(val: boolean, key: string): boolean;
}

/**
 * Records calls to {@link TestConsole.assertSometimes}.
 */
export type Coverage = Record<string, Record<"true" | "false", number>>;

export class CountingTestConsole implements TestConsole {
  #errorCount = 0;

  constructor(readonly coverage: Coverage = {}) {}

  get errorCount(): number {
    return this.#errorCount;
  }

  log(..._data: unknown[]): void {}

  error(..._data: unknown[]): void {
    this.#errorCount++;
  }

  debugger() {}

  assertSometimes(val: boolean, key: string): boolean {
    this.coverage[key] ??= { true: 0, false: 0 };
    if (val) {
      this.coverage[key].true++;
    } else {
      this.coverage[key].false++;
    }
    return val;
  }
}

/**
 * A test console to be used when repeating a test with an example that's
 * expected to fail.
 */
export class FailingTestConsole extends CountingTestConsole {
  constructor(private wrapped: SystemConsole) {
    super();
  }

  override log(...args: unknown[]) {
    this.wrapped.log(...args);
  }

  override error(...args: unknown[]) {
    super.error(...args);
    this.wrapped.error(...args);
  }

  override readonly debugger = stopInDebugger;
}
