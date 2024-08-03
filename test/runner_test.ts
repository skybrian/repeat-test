import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
  assertThrows,
  fail,
} from "@std/assert";

import { minPlayout, Pruned } from "../src/backtracking.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import Domain from "../src/domain_class.ts";
import * as arb from "../src/arbitraries.ts";
import * as dom from "../src/domains.ts";
import { success } from "../src/results.ts";

import {
  Console,
  depthFirstReps,
  parseRepKey,
  randomReps,
  Rep,
  repeatTest,
  RepFailure,
  reportFailure,
  runRep,
  runReps,
  serializeRepKey,
  TestFunction,
} from "../src/runner.ts";

const anyKey = arb.record({ seed: arb.int32(), index: arb.int(0, 100) });
const badKey = arb.oneOf([
  arb.record({ seed: arb.int32(), index: arb.int(-100, -1) }),
  arb.record({ seed: arb.strangeNumber(), index: arb.int(0, 100) }),
  arb.record({ seed: arb.int32(), index: arb.strangeNumber() }),
  arb.of({ seed: Number.MAX_SAFE_INTEGER, index: 0 }),
]);

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
    const badString = arb.oneOf([
      arb.anyString().filter((x) => x.split(":").length !== 2),
      arb.record({ k: anyKey, junk: arb.anyString() }).map(({ k, junk }) =>
        `${serializeRepKey(k)}:${junk}`
      ),
    ]);

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
  errorClass: new () => unknown;
};

function assertRepFailure<T>(
  actualRep: Rep<T> | RepFailure<unknown>,
  expected: FailureFields<T>,
): void {
  if (actualRep.ok) {
    fail(`expected a failure, got a success: ${actualRep}`);
  }
  const expectedKey = { seed: expected.seed, index: expected.index };
  assertEquals(actualRep.key, expectedKey);
  assertInstanceOf(actualRep.caught, expected.errorClass);
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
    assertRepFailure(second.value, { seed: 0, index: 1, errorClass: Error });

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
    const example = arb.int(1, 2).map((id) => {
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
    assertRepFailure(second.value, { seed, index: 1, errorClass: Error });
  });
});

function makeDefaultRep<T>(input: Arbitrary<T>, test: TestFunction<T>): Rep<T> {
  const gen = input.generate(minPlayout());
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
  assert(gen !== undefined);

  const rep: Rep<T> = {
    ok: true,
    key: { seed: 1, index: 1 },
    arb: input.arb,
    arg: gen,
    test,
  };
  return rep;
}

const nullConsole: Console = {
  log: () => {},
  error: () => {},
};

describe("runRep", () => {
  it("returns success if the test passes", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {});
    assertEquals(runRep(rep, nullConsole), success());
  });
  it("returns a failure if the test throws", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {
      throw new Error("test failed");
    });
    const result = runRep(rep, nullConsole);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
  });
  it("shrinks the input to a test that fails", () => {
    const input = dom.int(0, 100);
    const test = (i: number) => {
      if (i >= 10) {
        throw new Error("test failed");
      }
    };
    const rep = makeRep(input, 100, test);
    const result = runRep(rep, nullConsole);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
    assertEquals(result.arg, 10);
  });
});

describe("runReps", () => {
  it("returns any RepFailure it finds", () => {
    const failure: RepFailure<unknown> = {
      ok: false,
      key: { seed: 1, index: 1 },
      arg: 123,
      caught: new Error("oops"),
    };
    const result = runReps([failure], 1, nullConsole);
    assertEquals(result, failure);
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
        reportFailure(failure, nullConsole);
      },
      Error,
      "oops",
    );
  });
});

describe("repeatTest", () => {
  it("runs a test function once for each of a list of inputs", () => {
    const inputs: number[] = [];
    const collect = (val: number) => {
      inputs.push(val);
    };
    repeatTest(Arbitrary.of(1, 2, 3), collect);
    assertEquals(inputs, [1, 2, 3]);
  });
  it("accepts a list of test arguments", () => {
    const inputs: number[] = [];
    const collect = (val: number) => {
      inputs.push(val);
    };
    repeatTest([1, 2, 3], collect);
    assertEquals(inputs, [1, 2, 3]);
  });
  it("stops running the test function after the limit given by `reps`", () => {
    for (let expected = 0; expected < 100; expected++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      repeatTest(arb.int32(), increment, { reps: expected });
      assertEquals(actual, expected);
    }
  });
  it("uses a constant only once when given an unbalanced choice of examples", () => {
    const unbalanced = Arbitrary.oneOf([
      arb.of(123.4),
      arb.int32(),
    ]);
    const counts = new Map<number, number>();
    repeatTest(unbalanced, (i) => {
      counts.set(i, (counts.get(i) || 0) + 1);
    });
    assertEquals(counts.get(123.4), 1);
  });
  describe("when the 'only' option is set", () => {
    it("runs one rep", () => {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      repeatTest(arb.int32(), increment, { reps: 100, only: "123:456" });
      assertEquals(actual, 1);
    });
    it("reproduces a previous test run for a small arbitrary", () => {
      repeatTest(arb.int(0, 100), (i) => {
        // assert(i != 42);
        assertEquals(i, 42);
      }, { only: "0:42" });
    });
    it("reproduces a previous test run for a large arbitrary", () => {
      const example = arb.from((pick) => {
        return pick(arb.int(1, 500));
      });
      assertEquals(example.maxSize, undefined);
      repeatTest(example, (i) => {
        // assert(i != 42);
        assertEquals(i, 42);
      }, { only: "-756845603:239" });
    });
  });
});
