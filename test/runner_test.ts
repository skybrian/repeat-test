import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
  fail,
} from "@std/assert";

import { minPlayout, Pruned } from "../src/backtracking.ts";
import { generate } from "../src/generated.ts";
import { Arbitrary } from "../src/arbitrary_class.ts";
import type { Domain } from "../src/domain_class.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";
import { success } from "../src/results.ts";
import { generateDefault } from "../src/multipass_search.ts";

import { NullConsole, type TestConsole } from "../src/console.ts";

import {
  depthFirstReps,
  parseRepKey,
  randomReps,
  type Rep,
  repeatTest,
  type RepFailure,
  reportFailure,
  runRep,
  runReps,
  serializeRepKey,
  type TestFunction,
} from "../src/runner.ts";

const strangeNumber = Arbitrary.of(
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
);

const anyKey = arb.record({ seed: arb.int32(), index: arb.int(0, 100) });
const badKey = arb.oneOf(
  arb.record({ seed: arb.int32(), index: arb.int(-100, -1) }),
  arb.record({ seed: strangeNumber, index: arb.int(0, 100) }),
  arb.record({ seed: arb.int32(), index: strangeNumber }),
  arb.of({ seed: Number.MAX_SAFE_INTEGER, index: 0 }),
);

describe("parseRepKey", () => {
  it("parses any key emitted by serializeRepKey", () => {
    repeatTest(anyKey, (key) => {
      const serialized = serializeRepKey(key);
      assertEquals(parseRepKey(serialized), success(key));
    });
  });
  it("returns a failure if the serialized key had bad data", () => {
    repeatTest(badKey, (key) => {
      const serialized = serializeRepKey(key);
      assertEquals(parseRepKey(serialized).ok, false);
    });
  });
  it("returns a failure if the serialized key isn't in the right format", () => {
    const badString = arb.oneOf(
      arb.string().filter((x) => x.split(":").length !== 2),
      arb.record({ k: anyKey, junk: arb.string() }).map(({ k, junk }) =>
        `${serializeRepKey(k)}:${junk}`
      ),
    );

    repeatTest(badString, (s) => {
      assertEquals(parseRepKey(s).ok, false);
    });
  });
});

type RepFields<T> = {
  seed: number;
  index: number;
  arg: T;
  test: TestFunction<T>;
};

function assertRep<T>(
  actualRep: Rep<T> | RepFailure<unknown>,
  expected: RepFields<T>,
): void {
  if (!actualRep.ok) {
    fail(`expected a success, got a failure: ${actualRep}`);
  }
  const actual: RepFields<T> = {
    seed: actualRep.key.seed,
    index: actualRep.key.index,
    arg: actualRep.arg.val,
    test: actualRep.test,
  };
  assertEquals(actual, expected);
}

type FailureFields<T> = {
  seed: number;
  index: number;
  messageIncludes: string;
};

function assertRepFailure<T>(
  actualRep: { ok: true } | RepFailure<unknown>,
  expected: FailureFields<T>,
): void {
  if (actualRep.ok) {
    fail(`expected a failure, got a success: ${actualRep}`);
  }
  const expectedKey = { seed: expected.seed, index: expected.index };
  assertEquals(actualRep.key, expectedKey);

  const caught = actualRep.caught;
  if (!(caught instanceof Error)) {
    fail(`expected caught to be an Error, got ${caught}`);
  }

  const msg = caught.message;
  assert(
    msg.includes(expected.messageIncludes),
    `unexpected error message: ${msg}`,
  );
}

describe("sequentialReps", () => {
  it("generates reps with the right keys", () => {
    const example = arb.int(1, 10).filter((x) => x !== 10);
    const test = () => {};
    const reps = depthFirstReps(example, test);

    let index = 0;
    for (const rep of reps) {
      assertRep(rep, { seed: 0, index, arg: index + 1, test });
      index++;
    }
    assertEquals(index, 9);
  });

  it("records an exception while generating a rep and continues", () => {
    const example = arb.int(1, 3).map((id) => {
      if (id === 2) {
        throw new Error("oops!");
      }
      return id;
    });
    const test = () => {};
    const reps = depthFirstReps(example, test);

    const first = reps.next();
    assertFalse(first.done);
    assertRep(first.value, { seed: 0, index: 0, arg: 1, test });

    const second = reps.next();
    assertFalse(second.done);
    assertRepFailure(second.value, {
      seed: 0,
      index: 1,
      messageIncludes: "oops!",
    });

    const third = reps.next();
    assertFalse(third.done);
    assertRep(third.value, { seed: 0, index: 2, arg: 3, test });

    assert(reps.next().done, "expected reps to be done");
  });
});

describe("randomReps", () => {
  it("generates reps with the right keys", () => {
    repeatTest(arb.int32(), (seed) => {
      const ten = arb.from((pick) => {
        return pick(arb.int(1, 10));
      });
      assertEquals(ten.maxSize, undefined);

      const test = () => {};

      const reps = randomReps(seed, ten, test);

      const picks = new Set<number>();
      for (const rep of reps) {
        if (!rep.ok) {
          console.log(rep.caught);
          fail(`failed to generate rep: ${rep.caught}`);
        }
        assertEquals(rep.key, { seed, index: picks.size });
        assertEquals(rep.test, test);
        assertFalse(picks.has(rep.arg.val));
        picks.add(rep.arg.val);
      }
      assertEquals(picks.size, 10, "didn't generate the right number of reps");
    });
  });

  it("retries when a pick fails", () => {
    const diceRoll = arb.int(1, 6);

    const rerollTwos = Arbitrary.from((pick) => {
      const roll = pick(diceRoll);
      if (roll === 2) {
        throw new Pruned("try again");
      }
      return "good";
    });

    const test = () => {};

    repeatTest(arb.int32(), (seed) => {
      const reps = randomReps(seed, rerollTwos, test);

      for (let i = 0; i < 4; i++) {
        const rep = reps.next().value;
        assert(rep.ok);
        assertEquals(rep.key, { seed, index: i });
        assertEquals(rep.arg.val, "good");
        assertEquals(rep.test, test);
      }
    });
  });

  it("records an exception while generating a rep and continues", () => {
    const example = arb.int(1, 3).map((id) => {
      if (id === 2) {
        throw new Error("oops!");
      }
      return id;
    });
    const test = () => {};

    const seed = 123;
    const reps = randomReps(seed, example, test);

    const first = reps.next();
    assertFalse(first.done);
    assertRep(first.value, { seed, index: 0, arg: 1, test });

    const second = reps.next();
    assertFalse(second.done);
    assertRepFailure(second.value, {
      seed,
      index: 1,
      messageIncludes: "oops!",
    });

    const third = reps.next();
    assertFalse(third.done);
    assertRep(third.value, { seed, index: 2, arg: 3, test });

    assert(reps.next().done, "expected reps to be done");
  });

  it("records an exception if the Arbitrary is nondeterministic", () => {
    let rangeSize = 1;
    const example = arb.from((pick) => {
      rangeSize++;
      return pick(arb.int(1, rangeSize));
    });
    const test = () => {};

    const seed = 123;
    const reps = randomReps(seed, example, test);

    const first = reps.next();
    assertFalse(first.done);
    assertRep(first.value, { seed, index: 0, arg: 1, test });

    const second = reps.next();
    assertFalse(second.done);
    assertRepFailure(second.value, {
      seed,
      index: 1,
      messageIncludes: "pick request range doesn't match previous playout",
    });
  });
});

function makeDefaultRep<T>(input: Arbitrary<T>, test: TestFunction<T>): Rep<T> {
  const gen = generate(input, minPlayout());
  assert(gen !== undefined);

  const rep: Rep<T> = {
    ok: true,
    key: { seed: 1, index: 1 },
    arb: input,
    arg: gen,
    test,
  };
  return rep;
}

function makeRep<T>(input: Domain<T>, arg: T, test: TestFunction<T>): Rep<T> {
  const gen = input.regenerate(arg);
  if (!gen.ok) {
    fail(`failed to regenerate: ${gen.message}`);
  }

  const rep: Rep<T> = {
    ok: true,
    key: { seed: 1, index: 1 },
    arb: input,
    arg: gen,
    test,
  };
  return rep;
}

export type LogMessage = {
  args: unknown[];
  type: "log" | "error";
};

export class RecordingConsole implements TestConsole {
  messages: LogMessage[] = [];

  log(...args: unknown[]) {
    this.messages.push({ args, type: "log" });
  }
  error(...args: unknown[]) {
    this.messages.push({ args, type: "error" });
  }
}

describe("runRep", () => {
  it("returns success if the test passes", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {});
    assertEquals(runRep(rep, new NullConsole()), success());
  });

  it("suppresses console output when the test passes", () => {
    const console = new RecordingConsole();
    const rep = makeDefaultRep(arb.int(1, 10), (_x, console) => {
      console.log("hello");
    });
    assertEquals(runRep(rep, console), success());
    assertEquals(console.messages.length, 0);
  });

  it("returns a failure if the test throws", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {
      throw new Error("test failed");
    });
    const result = runRep(rep, new NullConsole());
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
  });

  it("writes output to the console when the test throws", () => {
    const console = new RecordingConsole();
    const rep = makeDefaultRep(arb.int(1, 10), (_x, console) => {
      console.log("hello");
      throw new Error("test failed");
    });
    const result = runRep(rep, console);
    if (result.ok) fail("expected a failure");
    assertEquals(console.messages, [
      { args: ["\nTest failed. Shrinking..."], type: "log" },
      { args: ["hello"], type: "log" },
    ]);
  });

  it("returns a failure if the test writes an error", () => {
    const console = new RecordingConsole();
    const rep = makeDefaultRep(arb.int(1, 10), (_, console) => {
      console.error("oops!");
    });
    const result = runRep(rep, console);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test called console.error()");
    assertEquals(console.messages, [
      { args: ["\nTest failed. Shrinking..."], type: "log" },
      { args: ["oops!"], type: "error" },
    ]);
  });

  it("shrinks the input to a test that fails", () => {
    const input = dom.int(0, 100);
    const test = (i: number) => {
      if (i >= 10) {
        throw new Error("test failed");
      }
    };
    const rep = makeRep(input, 100, test);
    const result = runRep(rep, new NullConsole());
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
    assertEquals(result.arg, 10);
  });

  it("reports a failure for a flaky test", () => {
    let firstTime = true;
    const rep = makeDefaultRep(arb.int(1, 10), (_) => {
      if (firstTime) {
        firstTime = false;
        throw new Error("test failed");
      }
    });
    const console = new RecordingConsole();
    const result = runRep(rep, console);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "flaky test passed after shrinking");
    assertEquals(console.messages, [
      { args: ["\nTest failed. Shrinking..."], type: "log" },
    ]);
  });
});

describe("runReps", () => {
  it("passes through a RepFailure from the reps parameter", () => {
    const failure: RepFailure<number> = {
      ok: false,
      key: { seed: 1, index: 1 },
      arg: undefined,
      caught: new Error("oops"),
    };
    const result = runReps([failure], 1, new NullConsole());
    assertEquals(result, failure);
  });
  it("returns a RepFailure from running the test", () => {
    const example = arb.int(1, 10);
    const rep: Rep<number> = {
      ok: true,
      key: { seed: 1, index: 1 },
      arb: example,
      arg: generateDefault(example),
      test: () => {
        throw new Error("oops");
      },
    };
    const result = runReps([rep], 1, new NullConsole());
    assertRepFailure(result, {
      seed: 1,
      index: 1,
      messageIncludes: "oops",
    });
  });
});

describe("reportFailure", () => {
  it("throws the caught error", () => {
    const caught = new Error("oops");
    const failure: RepFailure<unknown> = {
      ok: false,
      key: { seed: 1, index: 1 },
      arg: 123,
      caught,
    };
    assertThrows(
      () => {
        reportFailure(failure, new NullConsole());
      },
      Error,
      "oops",
    );
  });
});

describe("repeatTest", () => {
  it("runs a test function once for each of a list of inputs", () => {
    const inputs: number[] = [];
    const test = (val: number) => {
      inputs.push(val);
    };
    repeatTest(Arbitrary.of(1, 2, 3), test);
    assertEquals(inputs, [1, 2, 3]);
  });
  it("stops running reps when the first one fails", () => {
    const inputs: number[] = [];
    const test = (val: number) => {
      inputs.push(val);
      if (val === 2) {
        throw new Error("oops");
      }
    };
    assertThrows(
      () => {
        repeatTest(Arbitrary.of(1, 2, 3), test, { console: new NullConsole() });
      },
      Error,
      "oops",
    );
    // There will be additional calls to the test function due to shrinking.
    assert(inputs.length > 3);
    assertEquals(inputs.slice(0, 2), [1, 2]);
    assertEquals(inputs.slice(-1), [2]);
    assertFalse(inputs.includes(3));
  });
  it("accepts a list of test arguments", () => {
    const inputs: number[] = [];
    const collect = (val: number) => {
      inputs.push(val);
    };
    repeatTest([1, 2, 3], collect);
    assertEquals(inputs, [1, 2, 3]);
  });
  it("throws an exception if reps isn't an integer", () => {
    assertThrows(
      () => {
        repeatTest(arb.int32(), () => {}, { reps: 0.5 });
      },
      Error,
      "reps option must be an integer; got 0.5",
    );
  });
  it("throws an exception if reps is 0", () => {
    assertThrows(
      () => {
        repeatTest(arb.int32(), () => {}, { reps: 0 });
      },
      Error,
      "reps option must be at least 1; got 0",
    );
  });
  it("stops running the test function after the limit given by `reps`", () => {
    for (let expected = 1; expected < 100; expected++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      repeatTest(arb.int32(), increment, { reps: expected });
      assertEquals(actual, expected);
    }
  });
  it("uses a constant only once when given an unbalanced choice of examples", () => {
    const unbalanced = Arbitrary.oneOf(
      arb.of(123.4),
      arb.int32(),
    );
    const counts = new Map<number, number>();
    repeatTest(unbalanced, (i) => {
      counts.set(i, (counts.get(i) || 0) + 1);
    });
    assertEquals(counts.get(123.4), 1);
  });
  describe("when the 'only' option is set", () => {
    it("throws an Error if it's invalid", () => {
      assertThrows(
        () => repeatTest(arb.int32(), () => {}, { only: "invalid" }),
        Error,
        "can't parse 'only' option: invalid format",
      );
    });
    it("runs one rep and fails", () => {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      assertThrows(
        () =>
          repeatTest(arb.int32(), increment, { reps: 100, only: "123:456" }),
        Error,
        "only option is set",
      );
      assertEquals(actual, 1);
    });
    it("throws an Error if it runs out of reps", () => {
      const example = arb.int(1, 6);
      const test = () => {
        fail("test should not run");
      };
      repeatTest(arb.int(6, 10), (skipIndex) => {
        assertThrows(
          () => repeatTest(example, test, { only: `0:${skipIndex}` }),
          Error,
          "skipped all 6 reps",
        );
      });
    });
    it("reproduces a previous test run for a small arbitrary", () => {
      assertThrows(
        () =>
          repeatTest(arb.int(0, 100), (i) => {
            // assert(i != 42);
            assertEquals(i, 42);
          }, { only: "0:42" }),
        Error,
        "only option is set",
      );
    });
    it("reproduces a previous test run for a large arbitrary", () => {
      const example = arb.from((pick) => {
        return pick(arb.int(1, 500));
      });
      assertEquals(example.maxSize, undefined);
      assertThrows(
        () =>
          repeatTest(example, (i) => {
            // assert(i != 42);
            assertEquals(i, 42);
          }, { only: "-756845603:239" }),
        Error,
        "only option is set",
      );
    });
    it("doesn't run out of memory for a filtered string", () => {
      const example = arb.string().filter((s) => s.startsWith("a"));
      repeatTest(example, (s) => {
        assert(
          s.startsWith("a"),
          `expected string to start with 'a', got '${s}'`,
        );
      });
    });
  });
});
