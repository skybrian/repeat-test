import {
  deepStrictEqual as assertEquals,
  ok as assert,
  rejects,
  strictEqual as assertSame,
} from "node:assert/strict";
import { describe, it } from "node:test";
import { arb } from "@skybrian/repeat-test";
import { repeatTest } from "@skybrian/repeat-test/runner";
import { assertThrows } from "./support/asserts.ts";
import { RecordingConsole } from "./support/console.ts";

describe("repeatTest edge cases", () => {
  it("rejects an invalid only option before calling the test", () => {
    const con = new RecordingConsole();
    let calls = 0;
    assertThrows(
      () =>
        repeatTest(arb.int(0, 12), () => {
          calls++;
        }, { only: "invalid", console: con }),
      Error,
      "can't parse 'only' option: invalid id",
    );
    assertEquals(calls, 0);
    con.checkEmpty();
  });

  it("runs just one passing replay and still reports that only is set", () => {
    const con = new RecordingConsole();
    const seen: number[] = [];
    assertThrows(
      () =>
        repeatTest(arb.int(0, 12), (n) => {
          seen.push(n);
        }, { only: "0:0:1", reps: 100, console: con }),
      Error,
      "only option is set",
    );
    assertEquals(seen.length, 1);
    con.checkEmpty();
  });

  it("reports exhausted replay keys without calling the test", () => {
    const con = new RecordingConsole();
    let calls = 0;
    for (const index of [6, 7, 8, 9, 10]) {
      assertThrows(
        () =>
          repeatTest(arb.int(1, 6), () => {
            calls++;
          }, { only: `0:0:${index}`, console: con }),
        Error,
        "skipped all 6 reps",
      );
    }
    assertEquals(calls, 0);
    con.checkEmpty();
  });

  it("escapes invisible and formatting characters in failure diagnostics", () => {
    const con = new RecordingConsole();
    for (
      const [value, expected] of [
        ["a\r b", '"a\\r b"'],
        ["\u2028", '"\\u2028"'],
        ["\u2029", '"\\u2029"'],
        ["\u007f\u0080\u009f", '"\\u007f\\u0080\\u009f"'],
        [
          "\u00ad\u200b\u200c\u200d\u2060\ufeff",
          '"\\u00ad\\u200b\\u200c\\u200d\\u2060\\ufeff"',
        ],
        [
          "\u061c\u200e\u200f\u202a\u202e\u2066\u2069\u206f",
          '"\\u061c\\u200e\\u200f\\u202a\\u202e\\u2066\\u2069\\u206f"',
        ],
        ['"\\\n', '"\\"\\\\\\n"'],
        ["\r", '"\\r"'],
        ["\u200b", '"\\u200b"'],
        ["\u202e", '"\\u202e"'],
        ["\u009b", '"\\u009b"'],
      ]
    ) {
      const seen: string[] = [];
      const failure = new Error("invisible input");
      assertSame(
        assertThrows(
          () =>
            repeatTest(arb.of(value), (arg) => {
              seen.push(arg);
              throw failure;
            }, { reps: 0, console: con }),
        ),
        failure,
      );
      assertEquals(seen, [value, value]);
      con.loggedTestFailed();
      con.logged(["attempt FAILED, using:", expected], { type: "error" });
      con.logged('rerun using {only: "0"}');
      con.checkEmpty();
    }
  });

  it("keeps the original error and input when only the first call fails", () => {
    const con = new RecordingConsole();
    const seen: number[] = [];
    const failure = new Error("first-call-only failure");
    assertSame(
      assertThrows(
        () =>
          repeatTest(arb.int(0, 12), (n) => {
            seen.push(n);
            if (seen.length === 1) throw failure;
          }, { only: "0:0:1", console: con }),
      ),
      failure,
    );
    assert(seen[0] > 3, "the original input must allow shrinking attempts");
    assert(seen.length > 2, "the runner must retry the flaky callback");
    con.loggedTestFailed();
    con.logged("Flaky test passed after shrinking. Retrying...");
    con.logged("Test passes after shrinking. Reporting original error.");
    con.logged(["attempt FAILED, using:", seen[0]], { type: "error" });
    con.logged('rerun using {only: "0:0:1"}');
    con.checkEmpty();
  });

  it("switches to a Promise when shrinking a synchronous failure", async () => {
    const con = new RecordingConsole();
    const seen: number[] = [];
    const pending = repeatTest(arb.int(0, 12), (n) => {
      seen.push(n);
      if (seen.length === 1) throw new Error(`failed with ${n}`);
      return Promise.resolve().then(() => {
        if (n >= 3) throw new Error(`failed with ${n}`);
      });
    }, { only: "0:0:1", console: con });
    assert(pending instanceof Promise);
    assert(seen[0] > 3);
    await rejects(() => pending, { name: "Error", message: "failed with 3" });
    assertEquals(seen.at(-1), 3);
    con.loggedTestFailed();
    con.logged(["attempt FAILED, using:", 3], { type: "error" });
    con.logged('rerun using {only: "0:0:1"}');
    con.checkEmpty();
  });

  it("waits for the interrupted synchronous shrink attempt before restarting", async () => {
    const con = new RecordingConsole();
    const failure = new Error("threshold failure");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let candidatePending = false;
    const seen: number[] = [];
    const pending = repeatTest(arb.int(0, 12), (n) => {
      assert(!candidatePending, "shrink callbacks must not overlap");
      seen.push(n);
      if (seen.length === 1) throw failure;
      if (seen.length === 2) {
        candidatePending = true;
        return gate.then(() => {
          candidatePending = false;
          if (n >= 3) throw failure;
        });
      }
      if (n >= 3) throw failure;
    }, { only: "0:0:1", console: con });
    assert(pending instanceof Promise);
    let settled = false;
    const completion = rejects(() => pending, (error) => error === failure)
      .then(() => {
        settled = true;
      });
    try {
      // Let any prematurely scheduled restart run while the gate is closed.
      await Promise.resolve();
      await Promise.resolve();
      assert(seen[0] > 3);
      assertEquals(seen.length, 2);
      assert(candidatePending);
      assertEquals(settled, false);
    } finally {
      release();
    }
    await completion;
    assertEquals(seen.at(-1), 3);
    con.loggedTestFailed();
    con.logged(["attempt FAILED, using:", 3], { type: "error" });
    con.logged('rerun using {only: "0:0:1"}');
    con.checkEmpty();
  });

  describe("console.sometimes()", () => {
    it("passes with both outcomes on explicit examples", () => {
      const con = new RecordingConsole();
      const seen: number[] = [];
      repeatTest([0, 1], (n, console) => {
        seen.push(n);
        assertEquals(console.sometimes("zero", n === 0), n === 0);
      }, { reps: 0, console: con });
      assertEquals(seen, [0, 1]);
      con.checkEmpty();
    });

    for (const condition of [false, true]) {
      it(`fails when never ${condition ? "false" : "true"}, even in only mode`, () => {
        const con = new RecordingConsole();
        let calls = 0;
        // only bypasses reduced-REPS coverage suppression, but runs one rep.
        const caught = assertThrows(
          () =>
            repeatTest(arb.int(0, 12), (_n, console) => {
              calls++;
              // Accumulate multiple observations even though only selects one rep.
              assertEquals(console.sometimes("zero", condition), condition);
              assertEquals(console.sometimes("zero", condition), condition);
            }, { only: "0:0:1", console: con }),
          Error,
          `sometimes(zero) was never ${condition ? "false" : "true"}`,
        );
        assertEquals(caught.name, "AssertionError");
        assertEquals(calls, 1);
        con.logged(
          `sometimes(zero): true: ${condition ? 2 : 0}, false: ${
            condition ? 0 : 2
          }`,
        );
        con.checkEmpty();
      });
    }

    it("logs sometimes calls when the callback independently fails", () => {
      const con = new RecordingConsole();
      const failure = new Error("independent callback failure");
      const seen: number[] = [];
      assertSame(
        assertThrows(
          () =>
            repeatTest([123], (n, console) => {
              seen.push(n);
              assertEquals(console.sometimes("zero", n === 0), false);
              throw failure;
            }, { reps: 0, console: con }),
        ),
        failure,
      );
      assertEquals(seen, [123, 123]);
      con.loggedTestFailed();
      con.logged(["sometimes(zero) =>", false]);
      con.logged(["attempt FAILED, using:", 123], { type: "error" });
      con.logged('rerun using {only: "0"}');
      con.checkEmpty();
    });
  });
});
