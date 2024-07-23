import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import * as arb from "../../src/arbitraries.ts";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as dom from "../../src/domains.ts";

describe("boolean", () => {
  it("encodes booleans", () => {
    assertEncoding(dom.boolean(), [0], false);
    assertEncoding(dom.boolean(), [1], true);
  });
  it("rejects non-booleans", () => {
    assertEquals(dom.boolean().maybePickify(undefined), undefined);
    assertEquals(dom.boolean().maybePickify(0), undefined);
  });
});

describe("int", () => {
  it("throws when given an invalid range", () => {
    repeatTest(arb.invalidIntRange(), ({ min, max }) => {
      assertThrows(() => dom.int(min, max));
    });
  });

  it("round-trips integers for any valid range", () => {
    repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
      assertRoundTrip(dom.int(min, max), val);
    });
  });

  it("rejects integers outside the given range", () => {
    repeatTest(arb.intRange({ minMin: -100 }), ({ min, max }) => {
      const ints = dom.int(min, max);
      assertEquals(ints.maybePickify(min - 1), undefined);
      assertEquals(ints.maybePickify(max + 1), undefined);
    });
  });

  it("regenerates the original value", () => {
    repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
      const ints = dom.int(min, max);
      const copy = ints.regenerate(val);
      assert(copy !== undefined);
      assertEquals(copy.val, val);
    });
  });

  it("encodes values as themselves when the domain excludes negative numbers", () => {
    for (let i = 1; i <= 6; i++) {
      assertEncoding(dom.int(1, 6), [i], i);
    }
  });
  it("encodes values by negating them when the domain excludes positive numbers", () => {
    for (let i = -6; i <= -1; i++) {
      assertEncoding(dom.int(-6, -1), [-i], i);
    }
  });
  it("encodes values as a sign and magnitude when the domain includes both positive and negative numbers", () => {
    const signed = dom.int(-3, 3);
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
      () => dom.record(undefined as unknown as dom.RecordShape<unknown>),
      Error,
    );
    assertThrows(
      () => dom.record({ a: "b" } as dom.RecordShape<unknown>),
      Error,
    );
  });
  it("rejects a non-record", () => {
    assertEquals(dom.record({}).maybePickify(undefined), undefined);
  });
  it("rejects a record with an extra field", () => {
    assertEquals(dom.record({}).maybePickify({ a: 0 }), undefined);
  });
  it("rejects a record with a missing field", () => {
    assertEquals(
      dom.record({ a: dom.int(0, 1) }).maybePickify({}),
      undefined,
    );
  });
  it("rejects a record with an invalid field", () => {
    assertEquals(
      dom.record({ a: dom.int(0, 1) }).maybePickify({ a: 2 }),
      undefined,
    );
  });
  it("round-trips records", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const rec = dom.record(shape);
    repeatTest(rec.generator, (val) => {
      assertRoundTrip(rec, val);
    });
  });
  it("encodes records as a sequence of encoded fields", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const rec = dom.record(shape);
    assertEncoding(rec, [1, 6], { a: 1, b: 6 });
  });
});

describe("array", () => {
  describe("for a variable-length array", () => {
    const arr = dom.array(dom.int(1, 3));
    it("writes a zero for the end of an array", () => {
      assertEncoding(arr, [0], []);
    });
    it("writes a one to start each item", () => {
      assertEncoding(arr, [1, 2, 0], [2]);
      assertEncoding(arr, [1, 2, 1, 3, 0], [2, 3]);
    });
    it("rejects non-arrays", () => {
      assertEquals(arr.maybePickify(undefined), undefined);
      assertEquals(arr.maybePickify(0), undefined);
    });
  });
  describe("for a fixed-length array", () => {
    const arr = dom.array(dom.int(1, 3), { min: 2, max: 2 });
    it("encodes the items without prefixes", () => {
      assertEncoding(arr, [2, 3], [2, 3]);
    });
  });
});

describe("oneOf", () => {
  it("throws when given an empty array", () => {
    assertThrows(() => dom.oneOf([]), Error);
  });
  it("encodes a single case the same way as the child codec", () => {
    repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
      const child = dom.int(min, max);
      const oneWay = dom.oneOf([child]);
      assertEncoding(oneWay, child.pickify(val), val);
    });
  });
  it("encodes distinct cases by putting the case index first", () => {
    const multiWay = dom.oneOf([dom.int(1, 3), dom.int(4, 6)]);
    assertEncoding(multiWay, [0, 2], 2);
    assertEncoding(multiWay, [1, 5], 5);
  });
});
