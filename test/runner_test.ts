import type { Coverage, TestConsole } from "../src/console.ts";
import type { Domain } from "../src/domain_class.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  AssertionError,
  assertThrows,
  fail,
} from "@std/assert";

import { minPlayout, Pruned } from "../src/backtracking.ts";
import { generate } from "../src/generated.ts";
import { Arbitrary } from "../src/arbitrary_class.ts";
import * as arb from "@/arbs.ts";
import * as dom from "@/doms.ts";
import { success } from "../src/results.ts";
import { generateDefault } from "../src/ordered.ts";
import { RecordingConsole } from "../src/console.ts";

import {
  generateReps,
  parseRepKey,
  type Rep,
  repeatTest,
  type RepFailure,
  reportFailure,
  RepSource,
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

const anyKey = arb.record({
  id: arb.int(0, 100),
  seed: arb.int32(),
  index: arb.int(0, 100),
});
const badKey = arb.oneOf(
  arb.record({
    id: arb.int(-100, -1),
    seed: arb.int32(),
    index: arb.int(0, 100),
  }),
  arb.record({ id: arb.of(0), seed: arb.int32(), index: arb.int(-100, -1) }),
  arb.record({ id: arb.of(0), seed: strangeNumber, index: arb.int(0, 100) }),
  arb.record({ id: arb.of(0), seed: arb.int32(), index: strangeNumber }),
  arb.of(Object.freeze({ id: 0, seed: Number.MAX_SAFE_INTEGER, index: 0 })),
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
    const field = arb.string().filter((s) => !s.includes(":"));
    const badString = arb.record({ k: anyKey, junk: field }).map((
      { k, junk },
    ) => `${serializeRepKey(k)}:${junk}`);

    repeatTest(["invalid", badString], (s) => {
      assertFalse(parseRepKey(s).ok, "expected a failure");
    });
  });
});

type RepFields<T> = {
  id: number;
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
    id: actualRep.key.id,
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
  const expectedKey = { id: 0, seed: expected.seed, index: expected.index };
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

describe("RepSource", () => {
  it("doesn't generate any random reps for a constant", () => {
    const src = new RepSource(0, arb.of(123), () => {}, 456);

    const def = src.generateDefault();
    assert(def.ok);
    assertEquals(def.arg.replies.length, 0);
    assertEquals(def.arg.val, 123);

    const random = src.generateRandom();
    assertEquals(random, undefined);
  });
});

describe("generateReps", () => {
  it("generates reps with the right keys", () => {
    repeatTest(arb.int32(), (seed) => {
      const ten = arb.from((pick) => {
        return pick(arb.int(1, 10));
      });
      assertEquals(ten.maxSize, undefined);

      const test = () => {};

      const source = new RepSource(0, ten, test, seed);
      const reps = generateReps([source], seed);

      const picks = new Set<number>();
      for (const rep of reps) {
        if (!rep.ok) {
          console.log(rep.caught);
          fail(`failed to generate rep: ${rep.caught}`);
        }
        const index = picks.size;
        const expectedKey = { id: 0, seed: index === 0 ? 0 : seed, index };
        assertEquals(rep.key, expectedKey);
        assertEquals(rep.test, test);
        assertFalse(picks.has(rep.arg.val));
        picks.add(rep.arg.val);
      }
      assertEquals(picks.size, 10, "didn't generate the right number of reps");
    });
  });

  it("can generate a rep for each value in an array", () => {
    const examples = ["a", "b", "c"];
    const arbs = examples.map((ex) => arb.of(ex));
    const test = () => {};
    const seed = 123;
    const sources = arbs.map((arb, index) => {
      return new RepSource(index, arb, test, seed);
    });
    const reps = generateReps(sources, seed);
    let index = 0;
    for (const rep of reps) {
      assert(rep.ok);
      assertRep(rep, {
        id: index,
        seed: 0,
        index: 0,
        arg: examples[index],
        test,
      });
      index++;
    }
    assertEquals(index, 3);
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
      const source = new RepSource(0, rerollTwos, test, seed);
      const reps = generateReps([source], seed);

      for (let i = 0; i < 4; i++) {
        const rep = reps.next().value;
        assert(rep.ok);
        assertEquals(rep.key, { id: 0, seed: i === 0 ? 0 : seed, index: i });
        assertEquals(rep.arg.val, "good");
        assertEquals(rep.test, test);
      }
    });
  });

  it("records an exception while generating a rep and continues", () => {
    let fail = false;
    const example = arb.int(1, 3).map((id) => {
      if (id === 2 && fail) {
        throw new Error("oops!");
      }
      return id;
    });
    fail = true;
    const test = () => {};

    const seed = 123;
    const source = new RepSource(0, example, test, seed);
    const reps = generateReps([source], seed);

    const first = reps.next();
    assertFalse(first.done);
    assertRep(first.value, { id: 0, seed: 0, index: 0, arg: 1, test });

    const second = reps.next();
    assertFalse(second.done);
    assertRepFailure(second.value, {
      seed,
      index: 1,
      messageIncludes: "oops!",
    });

    const third = reps.next();
    assertFalse(third.done);
    assertRep(third.value, { id: 0, seed, index: 2, arg: 3, test });

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
    const source = new RepSource(0, example, test, seed);
    const reps = generateReps([source], seed);

    const first = reps.next();
    assertFalse(first.done);
    assertRep(first.value, { id: 0, seed: 0, index: 0, arg: 1, test });

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
    key: { id: 0, seed: 1, index: 1 },
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
    key: { id: 0, seed: 1, index: 1 },
    arb: input,
    arg: gen,
    test,
  };
  return rep;
}

describe("runRep", () => {
  let con = new RecordingConsole();
  let coverage: Coverage = {};

  beforeEach(() => {
    con = new RecordingConsole();
    coverage = {};
  });

  it("returns success if the test passes", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {});
    assertEquals(runRep(rep, con, coverage), success());
    con.checkEmpty();
  });

  it("suppresses console output when the test passes", () => {
    const rep = makeDefaultRep(arb.int(1, 10), (_x, console) => {
      assertFalse(console.on);
      console.log("hello");
    });
    assertEquals(runRep(rep, con, coverage), success());
    con.checkEmpty();
  });

  it("returns a failure if the test throws", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {
      throw new Error("test failed");
    });
    const result = runRep(rep, con, coverage);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    con.loggedTestFailed();
    con.checkEmpty();
  });

  it("writes output to the console when the test throws", () => {
    let onCount = 0;
    const rep = makeDefaultRep(arb.int(1, 10), (_x, console) => {
      if (console.on) {
        onCount++;
      }
      console.log("hello");
      throw new Error("test failed");
    });
    const result = runRep(rep, con, coverage);
    if (result.ok) fail("expected a failure");

    con.loggedTestFailed();
    con.logged("hello");
    con.checkEmpty();

    assertEquals(onCount, 1);
  });

  it("returns a failure if the test writes an error", () => {
    const rep = makeDefaultRep(arb.int(1, 10), (_, console) => {
      console.error("oops!");
    });
    const result = runRep(rep, con, coverage);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test called console.error()");

    con.loggedTestFailed();
    con.logged("oops!", { type: "error" });
    con.checkEmpty();
  });

  it("shrinks the input to a test that fails", () => {
    const input = dom.int(0, 100);
    const test = (i: number) => {
      if (i >= 10) {
        throw new Error("test failed");
      }
    };
    const rep = makeRep(input, 100, test);
    const result = runRep(rep, con, coverage);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
    assertEquals(result.arg, 10);
    con.loggedTestFailed();
    con.checkEmpty();
  });

  it("reports a failure for a flaky test", () => {
    let firstTime = true;
    const rep = makeDefaultRep(arb.int(1, 10), (_) => {
      if (firstTime) {
        firstTime = false;
        throw new Error("test failed");
      }
    });
    const result = runRep(rep, con, coverage);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "flaky test passed after shrinking");
    con.loggedTestFailed();
    con.checkEmpty();
  });
});

describe("runReps", () => {
  let con = new RecordingConsole();

  beforeEach(() => {
    con = new RecordingConsole();
  });

  it("passes through a RepFailure from the reps parameter", () => {
    const failure: RepFailure<number> = {
      ok: false,
      key: { id: 0, seed: 1, index: 1 },
      arg: undefined,
      caught: new Error("oops"),
    };
    const result = runReps([failure], 1, con);
    assertEquals(result, failure);
    con.checkEmpty();
  });

  it("returns a RepFailure from running the test", () => {
    const example = arb.int(1, 10);
    const rep: Rep<number> = {
      ok: true,
      key: { id: 0, seed: 1, index: 1 },
      arb: example,
      arg: generateDefault(example),
      test: () => {
        throw new Error("oops");
      },
    };
    const result = runReps([rep], 1, con);
    assertRepFailure(result, {
      seed: 1,
      index: 1,
      messageIncludes: "oops",
    });
    con.loggedTestFailed();
    con.checkEmpty();
  });
});

describe("reportFailure", () => {
  let con = new RecordingConsole();

  beforeEach(() => {
    con = new RecordingConsole();
  });

  it("throws the caught error", () => {
    const caught = new Error("oops");
    const failure: RepFailure<unknown> = {
      ok: false,
      key: { id: 0, seed: 1, index: 1 },
      arg: 123,
      caught,
    };
    assertThrows(
      () => {
        reportFailure(failure, con);
      },
      Error,
      "oops",
    );
    con.logged(["attempt FAILED, using:", 123], { type: "error" });
    con.logged('rerun using {only: "0:1:1"}');
    con.checkEmpty();
  });
});

describe("repeatTest", () => {
  let con = new RecordingConsole();

  beforeEach(() => {
    con = new RecordingConsole();
  });

  it("runs a test function once for each of a list of inputs", () => {
    const inputs: number[] = [];
    const test = (val: number) => {
      inputs.push(val);
    };
    repeatTest([1, 2, 3], test);
    assertEquals(inputs, [1, 2, 3]);
    con.checkEmpty();
  });

  it("runs a test function on a list of examples and Arbitraries", () => {
    const inputs: number[] = [];
    const test = (val: number) => {
      inputs.push(val);
    };
    repeatTest([1, 2, 3, arb.int32()], test);
    assertEquals(inputs.length, 1004, "unexpected number of test runs");
    assertEquals(inputs.slice(0, 4), [1, 2, 3, 0]);
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
        repeatTest([1, 2, 3], test, { console: con });
      },
      Error,
      "oops",
    );
    // The failed test will be run a second time with logging enabled.
    assertEquals(inputs, [1, 2, 2]);
    con.loggedTestFailed();
  });

  it("shrinks the test input when a random test fails", () => {
    const args: number[] = [];
    const test = (i: number) => {
      args.push(i);
      if (i >= 10) {
        throw new Error(`test failed with ${i}`);
      }
    };
    assertThrows(
      () => {
        repeatTest(arb.int32(), test, { console: con });
      },
      Error,
      "test failed with 10",
    );
    // There may be additional calls to the test function due to shrinking.
    assert(args.length > 1);
    assertEquals(args[0], 0);
    assertEquals(args[args.length - 1], 10);
    con.loggedTestFailed();
  });

  describe("with console.sometimes()", () => {
    const sometimesZero = (val: number, console: TestConsole) => {
      console.sometimes("zero", val === 0);
    };

    it("passes when sometimes true", () => {
      repeatTest(arb.int(0, 1), sometimesZero, { console: con });
      con.checkEmpty();
    });

    it("fails when never true", () => {
      assertThrows(
        () => {
          repeatTest(arb.int(1, 2), sometimesZero, { console: con });
        },
        AssertionError,
        "sometimes(zero) was never true",
      );
      con.logged("sometimes(zero): true: 0, false: 2");
      con.checkEmpty();
    });

    it("fails when never false", () => {
      assertThrows(
        () => {
          repeatTest(arb.of(0), sometimesZero, { console: con });
        },
        AssertionError,
        "sometimes(zero) was never false",
      );
      con.logged("sometimes(zero): true: 1, false: 0");
      con.checkEmpty();
    });

    it("logs when the test fails for some other reason", () => {
      assertThrows(
        () =>
          repeatTest(arb.of(123), (val, console) => {
            console.sometimes("zero", val === 0);
            fail("oops");
          }, { console: con }),
        Error,
        "oops",
      );
      con.loggedTestFailed();
      con.logged(["sometimes(zero) =>", false], { type: "log" });
    });
  });

  it("accepts a list of test arguments", () => {
    const inputs: number[] = [];
    const collect = (val: number) => {
      inputs.push(val);
    };
    repeatTest([1, 2, 3], collect);
    assertEquals(inputs, [1, 2, 3]);
    con.checkEmpty();
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
  it("stops running the test function after the limit given by `randomReps`", () => {
    for (let randomReps = 0; randomReps < 100; randomReps++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      con = new RecordingConsole();
      repeatTest(arb.int32(), increment, { reps: randomReps, console: con });
      assertEquals(actual, 1 + randomReps);
      con.checkEmpty();
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
    }, { console: con });
    assertEquals(counts.get(123.4), 1);
    con.checkEmpty();
  });

  describe("when the 'only' option is set", () => {
    it("throws an Error if it's invalid", () => {
      assertThrows(
        () => repeatTest(arb.int32(), () => {}, { only: "invalid" }),
        Error,
        "can't parse 'only' option: invalid id",
      );
    });
    it("runs one rep and fails", () => {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      assertThrows(
        () =>
          repeatTest(arb.int32(), increment, {
            reps: 100,
            only: "0:123:456",
          }),
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
          () => repeatTest(example, test, { only: `0:0:${skipIndex}` }),
          Error,
          "skipped all 6 reps",
        );
      });
    });
    it("reproduces a previous test run for a list of examples", () => {
      assertThrows(
        () =>
          repeatTest(["a", "b", "c", "d"], (i) => {
            assertEquals(i, "c");
          }, { only: "2:0:0" }),
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
          }, { only: "0:17851956:484" }),
        Error,
        "only option is set",
      );
    });
  });
});
