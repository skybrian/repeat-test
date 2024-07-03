import { describe, it } from "@std/testing/bdd";
import { assertEquals, fail } from "@std/assert";
import Arbitrary from "../src/arbitrary_class.ts";
import * as arb from "../src/arbitraries.ts";
import { success } from "../src/results.ts";

import {
  generateRandomReps,
  parseRepKey,
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

describe("generateRandomReps", () => {
  it("generates reps with the right keys", () => {
    repeatTest(anyKey, (start) => {
      const zero = Arbitrary.from(() => 0);
      const test = () => {};
      const reps = generateRandomReps(start, zero, test);
      for (let i = 0; i < 10; i++) {
        assertEquals(reps.next().value, {
          ok: true,
          key: { seed: start.seed, index: start.index + i },
          arg: 0,
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
  it("runs a test function for each of a list of inputs", () => {
    const inputs: number[] = [];
    const collect = (val: number) => {
      inputs.push(val);
    };
    repeatTest(Arbitrary.of(1, 2, 3), collect);
    assertEquals(inputs, [1, 2, 3]);
  });
  it("runs a test function the specified number of times", () => {
    for (let expected = 0; expected < 100; expected++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      const zero = Arbitrary.from(() => 0);
      repeatTest(zero, increment, { reps: expected });
      assertEquals(actual, expected);
    }
  });
  it("runs only once when the 'only' option is set", () => {
    let actual = 0;
    const increment = () => {
      actual++;
    };
    const zero = Arbitrary.from(() => 0);
    repeatTest(zero, increment, { reps: 100, only: "123:456" });
    assertEquals(actual, 1);
  });
  it("reproduces a previous test run when the 'only' option is set", () => {
    repeatTest(arb.int(0, 100), (i) => {
      assertEquals(i, 42);
    }, { only: "1866001691:205" });
  });
});
