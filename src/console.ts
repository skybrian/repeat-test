import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";

/**
 * The global console methods that are used in a {@link TestConsole}.
 *
 * See {@link https://developer.mozilla.org/en-US/docs/Web/API/console} MDN for
 * more about the console object.
 */
export interface SystemConsole {
  /**
   * Returns true if this is a TestConsole that's turned on.
   */
  get on(): boolean | undefined;

  /**
   * Writes a message to the console at "log" log level.
   */
  log(...data: unknown[]): void;

  /**
   * Writes a message to the console at "error" log level.
   */
  error(...data: unknown[]): void;
}

export const systemConsole: SystemConsole = console as unknown as SystemConsole;

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
   * Records a key-value pair and asserts that it is sometimes true and
   * sometimes false in a test.
   *
   * That is, `sometimes` must be called more than once with the given key, and
   * true and false must be passed at different times for that key's value.
   *
   * If the test is expected to fail, `sometimes` also writes a log message with
   * the key and its value.
   *
   * Returns the value passed in.
   */
  sometimes(key: string, val: boolean): boolean;

  /**
   * Records a condition and checks that it occurs with the expected probability.
   *
   * Unlike `sometimes()`, this verifies the observed proportion matches the
   * expected probability. For small sets where all values are enumerated
   * (e.g., `arb.boolean()`), it compares the exact ratio. For larger sampled
   * sets, it performs a statistical test using confidence intervals.
   *
   * @param key - A unique identifier for this check
   * @param expectedProb - The expected probability (0 to 1) that condition is true
   * @param condition - The condition to check
   * @returns The condition value passed in
   */
  checkOdds(key: string, expectedProb: number, condition: boolean): boolean;
}

/**
 * Records calls to {@link TestConsole.sometimes}.
 */
export type Coverage = Record<string, Record<"true" | "false", number>>;

/**
 * Records calls to {@link TestConsole.checkOdds}.
 */
export type OddsCheck = {
  expectedProb: number;
  trueCount: number;
  falseCount: number;
};

export type OddsChecks = Record<string, OddsCheck>;

export class CountingTestConsole implements TestConsole {
  #errorCount = 0;

  constructor(
    readonly coverage: Coverage = {},
    readonly oddsChecks: OddsChecks = {},
  ) {}

  get errorCount(): number {
    return this.#errorCount;
  }

  get on(): boolean {
    return false;
  }

  log(..._data: unknown[]): void {}

  error(..._data: unknown[]): void {
    this.#errorCount++;
  }

  sometimes(key: string, val: boolean): boolean {
    this.coverage[key] ??= { true: 0, false: 0 };
    if (val) {
      this.coverage[key].true++;
    } else {
      this.coverage[key].false++;
    }
    return val;
  }

  checkOdds(key: string, expectedProb: number, condition: boolean): boolean {
    if (!(key in this.oddsChecks)) {
      this.oddsChecks[key] = { expectedProb, trueCount: 0, falseCount: 0 };
    }
    if (condition) {
      this.oddsChecks[key].trueCount++;
    } else {
      this.oddsChecks[key].falseCount++;
    }
    return condition;
  }
}

export const nullConsole: SystemConsole = new CountingTestConsole();

/**
 * A test console to be used when repeating a test with an example that's
 * expected to fail.
 */
export class FailingTestConsole extends CountingTestConsole {
  constructor(private system: SystemConsole) {
    super();
  }

  override get on(): true {
    return true;
  }

  override log(...args: unknown[]) {
    this.system.log(...args);
  }

  override error(...args: unknown[]) {
    super.error(...args);
    this.system.error(...args);
  }

  override sometimes(key: string, val: boolean): boolean {
    super.sometimes(key, val);
    this.log(`sometimes(${key}) =>`, val);
    return val;
  }

  override checkOdds(key: string, expectedProb: number, condition: boolean): boolean {
    super.checkOdds(key, expectedProb, condition);
    this.log(`checkOdds(${key}, ${expectedProb}) =>`, condition);
    return condition;
  }
}

export type LogMessage = {
  args: unknown[];
  type: "log" | "error";
};

/**
 * Represents the system console and records all console output.
 */
export class RecordingConsole implements SystemConsole {
  messages: LogMessage[] = [];

  on = undefined;

  log(...args: unknown[]) {
    this.messages.push({ args, type: "log" });
  }
  error(...args: unknown[]) {
    this.messages.push({ args, type: "error" });
  }

  logged(message: string | unknown[], opts?: { type?: "log" | "error" }) {
    const expected = Array.isArray(message) ? message : [message];
    const expectedType = opts?.type ?? "log";
    assert(this.messages.length > 0, "no messages logged");
    assertEquals(this.messages.shift(), {
      args: expected,
      type: expectedType,
    });
  }

  loggedTestFailed() {
    this.logged("\nTest failed. Shrinking...");
  }

  checkEmpty() {
    assertEquals(this.messages, []);
  }
}
