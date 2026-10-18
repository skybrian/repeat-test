import { deepStrictEqual, equal, throws } from "node:assert/strict";
import { describe, it } from "node:test";
import { arb } from "@skybrian/repeat-test";
import { repeatTest } from "@skybrian/repeat-test/runner";
import { RecordingConsole } from "./support/console.ts";

// Record odds only for the explicit examples, not the tail's generated values.
// This fixes the observation count even when REPS adds extra repetitions. The
// enormous tail keeps the runner unexhausted, so it uses sampled rather than
// exact analysis. All observations are predetermined, not statistical guesses.
function sampledExamples(observations: number) {
  return [
    ...Array.from({ length: observations }, (_, i) => i),
    arb.int(observations, Number.MAX_SAFE_INTEGER),
  ];
}

describe("TestConsole.checkOdds", () => {
  it("passes an exact ratio after exhausting explicit examples", () => {
    const con = new RecordingConsole();
    const returned: boolean[] = [];
    repeatTest([false, true], (condition, console) => {
      returned.push(console.checkOdds("true", 0.5, condition));
    }, { reps: 1, console: con });

    deepStrictEqual(returned, [false, true]);
    con.logged("checkOdds() summary:");
    con.logged("  true: expected=0.5, observed=0.50, n=2, CI=exact ✓");
    con.checkEmpty();
  });

  it("passes an exact ratio after exhausting a boolean generator", () => {
    const con = new RecordingConsole();
    const returned: boolean[] = [];
    repeatTest(arb.boolean(), (condition, console) => {
      returned.push(console.checkOdds("true", 0.5, condition));
    }, {
      // Two random attempts (even at REPS=1%) discover generator exhaustion.
      reps: 200,
      console: con,
    });

    deepStrictEqual(returned, [false, true]);
    con.logged("checkOdds() summary:");
    con.logged("  true: expected=0.5, observed=0.50, n=2, CI=exact ✓");
    con.checkEmpty();
  });

  it("fails a mismatched exact ratio even with too few observations for a CI", () => {
    const con = new RecordingConsole();
    const returned: boolean[] = [];
    throws(
      () =>
        repeatTest([false, true], (condition, console) => {
          returned.push(console.checkOdds("true", 0.9, condition));
        }, { reps: 1, console: con }),
      {
        name: "AssertionError",
        message: "checkOdds() failed for: true (expected 0.9, observed 0.50)",
      },
    );

    // Aggregate odds failures do not rerun an individual example.
    deepStrictEqual(returned, [false, true]);
    con.logged("checkOdds() summary:");
    con.logged("  true: expected=0.9, observed=0.50, n=2, CI=exact ✗");
    con.checkEmpty();
  });

  for (
    const { key, expected, cutoff, observed, ci } of [
      {
        key: "half",
        expected: 0.5,
        cutoff: 100,
        observed: "0.50",
        ci: "[0.38, 0.62]",
      },
      {
        key: "one tenth",
        expected: 0.1,
        cutoff: 20,
        observed: "0.10",
        ci: "[0.03, 0.17]",
      },
    ]
  ) {
    it(`passes sampled odds near ${expected}`, () => {
      const con = new RecordingConsole();
      repeatTest(sampledExamples(200), (n, console) => {
        if (n >= 200) return;
        equal(console.checkOdds(key, expected, n < cutoff), n < cutoff);
      }, { reps: 1, console: con });

      con.logged("checkOdds() summary:");
      con.logged(
        `  ${key}: expected=${expected}, observed=${observed}, n=200, CI=${ci} ✓`,
      );
      con.checkEmpty();
    });
  }

  for (
    const { key, expected, cutoff, observed, ci } of [
      {
        key: "biased coin",
        expected: 0.9,
        cutoff: 100,
        observed: "0.50",
        ci: "[0.83, 0.97]",
      },
      {
        key: "one tenth, not half",
        expected: 0.5,
        cutoff: 20,
        observed: "0.10",
        ci: "[0.38, 0.62]",
      },
    ]
  ) {
    it(`fails sampled odds outside the CI for ${key}`, () => {
      const con = new RecordingConsole();
      throws(
        () =>
          repeatTest(sampledExamples(200), (n, console) => {
            if (n >= 200) return;
            equal(console.checkOdds(key, expected, n < cutoff), n < cutoff);
          }, { reps: 1, console: con }),
        {
          name: "AssertionError",
          message:
            `checkOdds() failed for: ${key} (expected ${expected}, observed ${observed}, outside CI ${ci})`,
        },
      );

      con.logged("checkOdds() summary:");
      con.logged(
        `  ${key}: expected=${expected}, observed=${observed}, n=200, CI=${ci} ✗`,
      );
      con.checkEmpty();
    });
  }

  it("skips sampled odds when the expected event is too rare for a CI", () => {
    const con = new RecordingConsole();
    repeatTest(sampledExamples(200), (n, console) => {
      if (n >= 200) return;
      equal(console.checkOdds("rare event", 0.001, false), false);
    }, { reps: 1, console: con });

    con.logged("checkOdds() summary:");
    con.logged(
      "  rare event: expected=0.001, observed=0.00, n=200, CI=n/a skipped",
    );
    con.checkEmpty();
  });

  it("skips sampled odds when the CI spans the entire probability range", () => {
    const con = new RecordingConsole();
    // Ten observations meet n*p >= 5, but the resulting CI is still [0, 1].
    repeatTest(sampledExamples(10), (n, console) => {
      if (n >= 10) return;
      equal(console.checkOdds("half", 0.5, false), false);
    }, { reps: 1, console: con });

    con.logged("checkOdds() summary:");
    con.logged("  half: expected=0.5, observed=0.00, n=10, CI=n/a skipped");
    con.checkEmpty();
  });

  for (const condition of [false, true]) {
    it(`returns and logs ${condition} when rerunning a failing callback`, () => {
      const con = new RecordingConsole();
      const failure = new Error("callback failed");
      const returned: boolean[] = [];
      throws(
        () =>
          repeatTest([condition], (value, console) => {
            returned.push(console.checkOdds("condition", 0.5, value));
            throw failure;
          }, { reps: 1, console: con }),
        (error: unknown) => error === failure,
      );

      deepStrictEqual(returned, [condition, condition]);
      con.loggedTestFailed();
      con.logged(["checkOdds(condition, 0.5) =>", condition]);
      con.logged(["attempt FAILED, using:", condition], { type: "error" });
      con.logged('rerun using {only: "0"}');
      con.checkEmpty();
    });
  }
});
