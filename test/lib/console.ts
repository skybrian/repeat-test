import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import type { SystemConsole } from "../../src/console.ts";

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
