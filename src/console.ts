import { stopInDebugger } from "./coverage_exclusions.ts";

/**
 * The global console object's methods that are available in a {@link TestConsole}.
 *
 * See {@link https://developer.mozilla.org/en-US/docs/Web/API/console} MDN for
 * more about the console object.
 */
export interface AnyConsole {
  /**
   * Outputs a message at "log" log level.
   */
  log(...data: unknown[]): void;

  /**
   * Outputs a message at "error" log level.
   *
   * If this is a TestConsole, also fails the test.
   */
  error(...data: unknown[]): void;
}

export interface TestConsole extends AnyConsole {
  /**
   * Conditionally executes a debugger statement.
   *
   * This method does nothing except when testing with an example that's
   * expected to fail.
   */
  debugger(): void;
}

/**
 * A test console that doesn't output anything.
 *
 * (However, logging an error will still fail the test.)
 */
export class NullConsole implements TestConsole {
  errorCount = 0;

  log() {}

  error() {
    this.errorCount++;
  }

  debugger() {}
}

/**
 * A test console to be used when testing with an example that's expected to fail.
 */
export class FailingTestConsole implements TestConsole {
  errorCount = 0;

  constructor(private wrapped: AnyConsole) {}

  log(...args: unknown[]) {
    this.wrapped.log(...args);
  }

  error(...args: unknown[]) {
    this.errorCount++;
    this.wrapped.error(...args);
  }

  readonly debugger = stopInDebugger;
}
