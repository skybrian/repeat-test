/**
 * The console object's methods that are available in {@link repeatTest}.
 *
 * Messages logged using this interface will emitted only when a test fails.
 *
 * See {@link https://developer.mozilla.org/en-US/docs/Web/API/console} MDN for
 * more about the console object.
 */
export interface TestConsole {
  /**
   * Outputs a message at "error" log level, and fails the test.
   */
  error(...data: unknown[]): void;

  /** Outputs a message at "log" log level. */
  log(...data: unknown[]): void;
}

export class NullConsole {
  errorCount = 0;
  log() {}
  error() {
    this.errorCount++;
  }
}

export class CountingConsole {
  constructor(private wrapped: TestConsole) {}

  errorCount = 0;
  log(...args: unknown[]) {
    this.wrapped.log(...args);
  }
  error(...args: unknown[]) {
    this.errorCount++;
    this.wrapped.error(...args);
  }
}
