import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as codec from "../../src/codecs.ts";

describe("boolean", () => {
  it("encodes booleans", () => {
    assertEncoding(codec.boolean(), [0], false);
    assertEncoding(codec.boolean(), [1], true);
  });
  it("rejects non-booleans", () => {
    assertEquals(codec.boolean().maybeEncode(undefined), undefined);
    assertEquals(codec.boolean().maybeEncode(0), undefined);
  });
});

const minMaxVal = arb.from((pick) => {
  const { min, max } = pick(arb.intRange());
  const val = pick(arb.int(min, max));
  return { min, max, val };
});

describe("int", () => {
  it("throws when given an invalid range", () => {
    repeatTest(arb.invalidIntRange(), ({ min, max }) => {
      assertThrows(() => codec.int(min, max));
    });
  });

  it("round-trips integers for any valid range", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      assertRoundTrip(codec.int(min, max), val);
    });
  });

  it("rejects integers outside the given range", () => {
    repeatTest(arb.intRange({ minMin: -100 }), ({ min, max }) => {
      const cdc = codec.int(min, max);
      assertEquals(cdc.maybeEncode(min - 1), undefined);
      assertEquals(cdc.maybeEncode(max + 1), undefined);
    });
  });

  it("returns a solution that matches the original value", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      const cdc = codec.int(min, max);
      const solution = cdc.toSolution(val);
      assert(solution !== undefined);
      assertEquals(solution.val, val);
    });
  });

  it("encodes values as themselves when the domain excludes negative numbers", () => {
    for (let i = 1; i <= 6; i++) {
      assertEncoding(codec.int(1, 6), [i], i);
    }
  });
  it("encodes values by negating them when the domain excludes positive numbers", () => {
    for (let i = -6; i <= -1; i++) {
      assertEncoding(codec.int(-6, -1), [-i], i);
    }
  });
  it("encodes values as a sign and magnitude when the domain includes both positive and negative numbers", () => {
    const signed = codec.int(-3, 3);
    for (let i = 0; i <= 3; i++) {
      assertEncoding(signed, [0, i], i);
    }
    for (let i = -3; i < 0; i++) {
      assertEncoding(signed, [1, -i], i);
    }
  });
});

describe("record", () => {
  it("throws an error for a non-record shape", () => {
    assertThrows(
      () => codec.record(undefined as unknown as codec.RecordShape<unknown>),
      Error,
    );
    assertThrows(
      () => codec.record({ a: "b" } as codec.RecordShape<unknown>),
      Error,
    );
  });
  it("rejects a non-record", () => {
    assertEquals(codec.record({}).maybeEncode(undefined), undefined);
  });
  it("rejects a record with an extra field", () => {
    assertEquals(codec.record({}).maybeEncode({ a: 0 }), undefined);
  });
  it("rejects a record with a missing field", () => {
    assertEquals(
      codec.record({ a: codec.int(0, 1) }).maybeEncode({}),
      undefined,
    );
  });
  it("rejects a record with an invalid field", () => {
    assertEquals(
      codec.record({ a: codec.int(0, 1) }).maybeEncode({ a: 2 }),
      undefined,
    );
  });
  it("round-trips records", () => {
    const shape = {
      a: codec.int(0, 1),
      b: codec.int(1, 6),
    };
    const rec = codec.record(shape);
    repeatTest(rec.domain, (val) => {
      assertRoundTrip(rec, val);
    });
  });
  it("encodes records as a sequence of encoded fields", () => {
    const shape = {
      a: codec.int(0, 1),
      b: codec.int(1, 6),
    };
    const rec = codec.record(shape);
    assertEncoding(rec, [1, 6], { a: 1, b: 6 });
  });
});

describe("array", () => {
  describe("for a variable-length array", () => {
    const arr = codec.array(codec.int(1, 3));
    it("writes a zero for the end of an array", () => {
      assertEncoding(arr, [0], []);
    });
    it("writes a one to start each item", () => {
      assertEncoding(arr, [1, 2, 0], [2]);
      assertEncoding(arr, [1, 2, 1, 3, 0], [2, 3]);
    });
    it("rejects non-arrays", () => {
      assertEquals(arr.maybeEncode(undefined), undefined);
      assertEquals(arr.maybeEncode(0), undefined);
    });
  });
  describe("for a fixed-length array", () => {
    const arr = codec.array(codec.int(1, 3), { min: 2, max: 2 });
    it("encodes the items without prefixes", () => {
      assertEncoding(arr, [2, 3], [2, 3]);
    });
  });
});

describe("oneOf", () => {
  it("throws when given an empty array", () => {
    assertThrows(() => codec.oneOf([]), Error);
  });
  it("encodes a single case the same way as the child codec", () => {
    repeatTest(minMaxVal, ({ min, max, val }) => {
      const child = codec.int(min, max);
      const oneWay = codec.oneOf([child]);
      assertEncoding(oneWay, child.pickify(val), val);
    });
  });
  it("encodes distinct cases by putting the case index first", () => {
    const multiWay = codec.oneOf([codec.int(1, 3), codec.int(4, 6)]);
    assertEncoding(multiWay, [0, 2], 2);
    assertEncoding(multiWay, [1, 5], 5);
  });
});
