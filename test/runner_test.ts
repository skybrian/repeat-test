import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, fail } from "@std/assert";

import { minPlayout, PlayoutPruned } from "../src/backtracking.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import Domain from "../src/domain_class.ts";
import * as arb from "../src/arbitraries.ts";
import * as codec from "../src/domains.ts";
import { success } from "../src/results.ts";

import {
  depthFirstReps,
  parseRepKey,
  randomReps,
  Rep,
  repeatTest,
  runRep,
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

describe("depthFirstReps", () => {
  it("generates reps with the right keys", () => {
    const test = () => {};
    const reps = depthFirstReps(arb.int(1, 10), test);

    let index = 0;
    for (const rep of reps) {
      assert(rep.ok);
      assertEquals(rep.key, { seed: 0, index });
      assertEquals(rep.arg.val, index + 1);
      assertEquals(rep.test, test);
      index++;
    }
    assertEquals(index, 10);
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

      const reps = randomReps(seed, ten, test, { expectedPlayouts: 10 });

      const picks = new Set<number>();
      for (const rep of reps) {
        assert(rep.ok);
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
        throw new PlayoutPruned("oh no, try again");
      }
      return "good";
    });

    const test = () => {};

    repeatTest(arb.int32(), (seed) => {
      const reps = randomReps(seed, rerollTwos, test, {
        expectedPlayouts: 0,
      });

      for (let i = 0; i < 4; i++) {
        const rep = reps.next().value;
        assert(rep.ok);
        assertEquals(rep.key, { seed, index: i });
        assertEquals(rep.arg.val, "good");
        assertEquals(rep.test, test);
      }
    });
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
    arb: input.generator,
    arg: gen,
    test,
  };
  return rep;
}

describe("runRep", () => {
  it("returns success if the test passes", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {});
    assertEquals(runRep(rep), success());
  });
  it("returns a failure if the test throws", () => {
    const rep = makeDefaultRep(arb.int(1, 10), () => {
      throw new Error("test failed");
    });
    const result = runRep(rep);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg.val);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
  });
  it("shrinks the input to a test that fails", () => {
    const input = codec.int(0, 1000);
    const test = (i: number) => {
      if (i >= 10) {
        throw new Error("test failed");
      }
    };
    const rep = makeRep(input, 100, test);
    const result = runRep(rep);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
    assertEquals(result.arg, 10);
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
