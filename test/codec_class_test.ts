import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../src/arbitraries.ts";
import { repeatTest } from "../src/runner.ts";

import Codec from "../src/codec_class.ts";

function assertRoundTrip<T>(codec: Codec<T>, input: T) {
  const encoded = codec.encode(input);
  const decoded = codec.decode(encoded);
  assertEquals(decoded, input);
}

describe("Codec.int", () => {
  it("throws when given an invalid range", () => {
    repeatTest(arb.invalidIntRange(), ({ min, max }) => {
      assertThrows(() => Codec.int(min, max));
    });
  });

  const minMaxVal = arb.from((pick) => {
    const { min, max } = pick(arb.intRange());
    const val = pick(arb.int(min, max));
    return { min, max, val };
  });

  it("round-trips integers for any valid range", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      assertRoundTrip(Codec.int(min, max), val);
    });
  });

  it("returns a solution that matches the original value", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      const codec = Codec.int(min, max);
      const solution = codec.toSolution(val);
      assert(solution !== undefined);
      assertEquals(solution.val, val);
    });
  });
});

describe("Codec.asciiChar", () => {
  it("round-trips ascii characters", () => {
    repeatTest(arb.asciiChar(), (val) => {
      assertRoundTrip(Codec.asciiChar(), val);
    });
  });
});

describe("Codec.char16", () => {
  it("round-trips single-character strings", () => {
    repeatTest(arb.char16(), (val) => {
      assertRoundTrip(Codec.char16(), val);
    });
  });
});

describe("Codec.string", () => {
  it("round-trips strings", () => {
    repeatTest(arb.anyString(), (val) => {
      assertRoundTrip(Codec.string(), val);
    });
  });
});
