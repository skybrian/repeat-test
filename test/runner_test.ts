import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, fail } from "@std/assert";
import Arbitrary, { PickFailed } from "../src/arbitrary_class.ts";
import * as arb from "../src/arbitraries.ts";
import { success } from "../src/results.ts";

import {
  depthFirstReps,
  parseRepKey,
  randomReps,
  Rep,
  repeatTest,
  runRep,
  serializeRepKey,
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
      assertEquals(rep, {
        ok: true,
        key: { seed: 0, index },
        arg: index + 1,
        test,
      });
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
        assertFalse(picks.has(rep.arg));
        picks.add(rep.arg);
      }
      assertEquals(picks.size, 10);
    });
  });
  it("retries when a pick fails", () => {
    const diceRoll = arb.int(1, 6, { default: 2 });

    const rerollOnes = Arbitrary.from((pick) => {
      const roll = pick(diceRoll);
      if (roll === 1) {
        throw new PickFailed("oh no, try again");
      }
      return "good";
    });

    const test = () => {};

    repeatTest(arb.int32(), (seed) => {
      const reps = randomReps(seed, rerollOnes, test, {
        expectedPlayouts: 0,
      });

      for (let i = 0; i < 4; i++) {
        assertEquals(reps.next().value, {
          ok: true,
          key: { seed, index: i },
          arg: "good",
          test,
        });
      }
    });
  });
});

describe("runRep", () => {
  it("returns success if the test passes", () => {
    const test = () => {};
    const rep: Rep<number> = {
      ok: true,
      key: { seed: 1, index: 1 },
      arg: 1,
      test,
    };
    assertEquals(runRep(rep), success());
  });
  it("returns a failure if the test throws", () => {
    const test = () => {
      throw new Error("test failed");
    };
    const rep: Rep<number> = {
      ok: true,
      key: { seed: 1, index: 1 },
      arg: 1,
      test,
    };
    const result = runRep(rep);
    if (result.ok) fail("expected a failure");
    assertEquals(result.key, rep.key);
    assertEquals(result.arg, rep.arg);
    if (!(result.caught instanceof Error)) {
      fail("expected caught to be an Error");
    }
    assertEquals(result.caught.message, "test failed");
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
      }, { only: "819765620:120" });
    });
  });
});
