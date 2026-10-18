import {
  deepStrictEqual as assertEquals,
  ok as assert,
  rejects,
} from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { arb } from "@skybrian/repeat-test";
import { repeatTest } from "@skybrian/repeat-test/runner";
import { assertThrows } from "./support/asserts.ts";
import { RecordingConsole } from "./support/console.ts";

describe("repeatTest", () => {
  let collectArgs: number[];
  let con: RecordingConsole;
  beforeEach(() => {
    collectArgs = [];
    con = new RecordingConsole();
  });
  const collect = (val: number) => {
    collectArgs.push(val);
  };

  it("returns synchronously and suppresses output when callbacks pass", () => {
    const result = repeatTest([1, 2], (n, console) => {
      console.log("input", n);
    }, { reps: 0, console: con });
    assertEquals(result, undefined);
    con.checkEmpty();
  });

  it("shrinks a failure and reproduces it using the reported replay key", () => {
    const seen: number[] = [];
    const failure = new Error("threshold failure");
    const property = (n: number) => {
      seen.push(n);
      if (n >= 3) throw failure;
    };
    // Pin a random rep in a tiny range: no sampling loop or REPS dependence.
    const caught = assertThrows(
      () =>
        repeatTest(arb.int(0, 12), property, {
          only: "0:0:1",
          console: con,
        }),
      Error,
      "threshold failure",
    );
    assertEquals(caught, failure);
    assert(seen[0] > 3, "the initial input must actually need shrinking");
    assertEquals(seen.at(-1), 3);

    const replayMessage = con.messages.find((message) =>
      typeof message.args[0] === "string" &&
      message.args[0].startsWith("rerun using")
    );
    assert(replayMessage);
    const key = /only: "([^"]+)"/.exec(String(replayMessage.args[0]))?.[1];
    assert(key, "failure diagnostics must provide a replay key");
    const initial = seen[0];
    seen.length = 0;
    assertEquals(
      assertThrows(
        () => repeatTest(arb.int(0, 12), property, { only: key, console: con }),
      ),
      failure,
    );
    assertEquals(seen[0], initial);
    assertEquals(seen.at(-1), 3);
  });

  it("shrinks an asynchronous rejection to the smallest failing input", async () => {
    const seen: number[] = [];
    const failure = new Error("async threshold failure");
    await rejects(
      () =>
        repeatTest(arb.int(0, 12), async (n) => {
          await Promise.resolve();
          seen.push(n);
          if (n >= 3) throw failure;
        }, { only: "0:0:1", console: con }),
      (error: unknown) => error === failure,
    );
    assert(seen[0] > 3);
    assertEquals(seen.at(-1), 3);
  });

  it("accepts a list of numbers", () => {
    repeatTest([1, 2, 3], collect, { reps: 0, console: con });
    assertEquals(collectArgs, [1, 2, 3]);
    con.checkEmpty();
  });

  it("awaits asynchronous callbacks before running the next rep", async () => {
    const seen: number[] = [];
    const pending: Promise<void> = repeatTest([1, 2, 3], async (n) => {
      await Promise.resolve();
      seen.push(n);
    }, { reps: 0, console: con });
    await pending;
    assertEquals(seen, [1, 2, 3]);
    con.checkEmpty();
  });

  it("switches to async when a later rep returns a Promise", async () => {
    const seen: number[] = [];
    const result = repeatTest([1, 2, 3], (n) => {
      seen.push(n);
      if (n === 2) return Promise.resolve();
    }, { reps: 0, console: con });
    assert(result instanceof Promise);
    assertEquals(seen, [1, 2]);
    await result;
    assertEquals(seen, [1, 2, 3]);
  });

  it("handles every mix of synchronous and asynchronous reps", async () => {
    for (let mask = 0; mask < 1 << 3; mask++) {
      const asyncReps = [0, 1, 2].map((i) => (mask & (1 << i)) !== 0);
      const seen: number[] = [];
      const result = repeatTest([0, 1, 2], (n) => {
        if (asyncReps[n]) {
          return Promise.resolve().then(() => {
            seen.push(n);
          });
        }
        seen.push(n);
      }, { reps: 0, console: con });

      if (asyncReps.some(Boolean)) {
        assert(
          result instanceof Promise,
          `mask ${mask} should return a Promise`,
        );
        await result;
      } else {
        assertEquals(result, undefined);
      }
      assertEquals(seen, [0, 1, 2], `wrong order for mask ${mask}`);
    }
    con.checkEmpty();
  });

  it("reports an async rejection and reruns the failure", async () => {
    const seen: number[] = [];
    await rejects(
      () =>
        repeatTest([1, 2, 3], async (n) => {
          seen.push(n);
          await Promise.resolve();
          if (n === 2) throw new Error("async failure");
        }, { reps: 0, console: con }),
      { name: "Error", message: "async failure" },
    );
    assertEquals(seen, [1, 2, 2]);
    con.loggedTestFailed();
    con.logged(["attempt FAILED, using:", 2], { type: "error" });
    con.logged('rerun using {only: "1"}');
    con.checkEmpty();
  });

  it("reports console.error after an await", async () => {
    await rejects(
      () =>
        repeatTest([1], async (_n, console) => {
          await Promise.resolve();
          console.error("late error");
        }, { reps: 0, console: con }),
      { name: "Error", message: "test called console.error()" },
    );
    con.loggedTestFailed();
    con.logged("late error", { type: "error" });
    con.logged(["attempt FAILED, using:", 1], { type: "error" });
    con.logged('rerun using {only: "0"}');
    con.checkEmpty();
  });

  it("keeps the only option behavior for async callbacks", async () => {
    await rejects(
      () =>
        repeatTest([1, 2], async (n) => {
          await Promise.resolve();
          assertEquals(n, 2);
        }, { only: "1", console: con }),
      { name: "Error", message: "only option is set" },
    );
    con.checkEmpty();
  });

  it("stops running when a test fails with a constant", () => {
    const inputs: number[] = [];
    const test = (val: number) => {
      inputs.push(val);
      if (val === 2) {
        throw new Error("oops");
      }
    };
    assertThrows(
      () => {
        repeatTest([1, 2, 3], test, { reps: 0, console: con });
      },
      Error,
      "oops",
    );
    // The failed test will be run a second time with logging enabled.
    assertEquals(inputs, [1, 2, 2]);
    con.loggedTestFailed();
  });

  it("throws an exception if reps isn't an integer", () => {
    assertThrows(
      () => {
        repeatTest(arb.int32(), () => {}, { reps: 0.5 });
      },
      Error,
      "reps option must be an integer; got 0.5",
    );
    con.checkEmpty();
  });

  it("throws an exception if reps is -1", () => {
    assertThrows(
      () => {
        repeatTest(arb.int32(), () => {}, { reps: -1 });
      },
      Error,
      "reps option must be non-negative; got -1",
    );
    con.checkEmpty();
  });
});
