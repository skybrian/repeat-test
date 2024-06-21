import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Arbitrary } from "../src/arbitraries.ts";
import * as arb from "../src/arbitraries.ts";
import { success } from "../src/results.ts";

import {
  generateReps,
  parseRepKey,
  repeatTest,
  serializeRepKey,
} from "../src/runner.ts";

const anyKey = arb.record({ seed: arb.int32, index: arb.int(0, 100) });
const badKey = arb.oneOf([
  arb.record({ seed: arb.int32, index: arb.int(-100, -1) }),
  arb.record({ seed: arb.strangeNumber, index: arb.int(0, 100) }),
  arb.record({ seed: arb.int32, index: arb.strangeNumber }),
  arb.example([{ seed: Number.MAX_SAFE_INTEGER, index: 0 }]),
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

describe("generateReps", () => {
  it("generates reps with the right keys", () => {
    repeatTest(anyKey, (start) => {
      const zero = new Arbitrary(() => 0);
      const test = () => {};
      const reps = generateReps(start, zero, test);
      for (let i = 0; i < 10; i++) {
        assertEquals(reps.next().value, {
          key: { seed: start.seed, index: start.index + i },
          arg: 0,
          test,
        });
      }
    });
  });
});

describe("repeatTest", () => {
  it("runs a test function the specified number of times", () => {
    for (let expected = 0; expected < 100; expected++) {
      let actual = 0;
      const increment = () => {
        actual++;
      };
      const zero = new Arbitrary(() => 0);
      repeatTest(zero, increment, { reps: expected });
      assertEquals(actual, expected);
    }
  });
  it("runs only once when the 'only' option is set", () => {
    let actual = 0;
    const increment = () => {
      actual++;
    };
    const zero = new Arbitrary(() => 0);
    repeatTest(zero, increment, { reps: 100, only: "123:456" });
    assertEquals(actual, 1);
  });
  it("reproduces a previous test run when the 'only' option is set", () => {
    repeatTest(arb.int(0, 100), (i) => {
      assertEquals(i, 42);
    }, { only: "1866001691:205" });
  });
});
