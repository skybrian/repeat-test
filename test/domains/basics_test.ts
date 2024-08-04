import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertEncoding, assertRoundTrip } from "../../src/asserts.ts";
import { repeatTest } from "../../src/runner.ts";

import * as arb from "../../src/arbitraries.ts";
import * as dom from "../../src/domains.ts";

describe("of", () => {
  describe("for a single-item domain", () => {
    const one = dom.of(1);
    it("accepts a constant value", () => {
      assertRoundTrip(one, 1);
    });
    it("rejects items not passed in as arguments", () => {
      assertThrows(() => one.parse(2), Error, "value didn't match");
    });
  });
  it("rejects items not passed in as arguments", () => {
    const items = dom.of(1, 2, 3);
    assertThrows(() => items.parse(4), Error, "value didn't match");
  });
});

describe("boolean", () => {
  const bool = dom.boolean();
  it("encodes booleans", () => {
    assertEncoding(bool, [0], false);
    assertEncoding(bool, [1], true);
  });
  it("rejects non-booleans", () => {
    assertThrows(() => bool.parse(undefined), Error, "not a boolean");
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
      assertThrows(() => ints.parse("hi"), Error, "not a safe integer");
      assertThrows(() => ints.parse(min - 1), Error, "not in range");
      assertThrows(() => ints.parse(max + 1), Error, "not in range");
    });
  });

  it("regenerates the original value", () => {
    repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
      const ints = dom.int(min, max);
      assertEquals(ints.parse(val), val);
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
  const empty = dom.record({});
  it("rejects a non-record", () => {
    assertThrows(() => empty.parse(undefined), Error, "not an object");
  });
  it("rejects a record with an extra field", () => {
    assertThrows(() => empty.parse({ a: 0 }), Error, "extra field: a");
  });
  it("rejects a record with a missing field", () => {
    const pair = dom.record({ a: dom.int(0, 1), b: dom.int(0, 1) });
    assertThrows(
      () => pair.parse({ a: 0 }),
      Error,
      "b: not a safe integer",
    );
  });
  it("rejects a record with an invalid field", () => {
    const rec = dom.record({ a: dom.int(0, 1) });
    assertThrows(() => rec.parse({ a: 2 }), Error, "a: not in range");
  });
  it("round-trips records", () => {
    const shape = {
      a: dom.int(0, 1),
      b: dom.int(1, 6),
    };
    const rec = dom.record(shape);
    repeatTest(rec, (val) => {
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
      assertThrows(() => arr.parse(undefined), Error, "not an array");
      assertThrows(() => arr.parse(0), Error, "not an array");
    });
    it("rejects arrays with an invalid item", () => {
      assertThrows(() => arr.parse([1, 0]), Error, "1: not in range");
    });
  });
  describe("for a fixed-length array", () => {
    const arr = dom.array(dom.int(1, 3), { min: 2, max: 2 });
    it("encodes the items without prefixes", () => {
      assertEncoding(arr, [2, 3], [2, 3]);
    });
    it("rejects arrays of the wrong length", () => {
      assertThrows(() => arr.parse([]), Error, "not in range");
      assertThrows(() => arr.parse([1, 2, 3]), Error, "not in range");
    });
    it("rejects arrays with an invalid item", () => {
      assertThrows(() => arr.parse([2, 0]), Error, "1: not in range");
    });
  });
});

describe("oneOf", () => {
  it("throws when given an empty array", () => {
    assertThrows(() => dom.oneOf([]), Error);
  });
  describe("for a single-case oneOf", () => {
    it("encodes it the same way as the child domain", () => {
      repeatTest(arb.minMaxVal(), ({ min, max, val }) => {
        const child = dom.int(min, max);
        const ignore = () => {};
        const expected = child.innerPickify(val, ignore);
        assert(expected !== undefined);
        const oneWay = dom.oneOf([child]);
        assertEncoding(oneWay, expected, val);
      });
    });
    it("rejects values that don't match", () => {
      const child = dom.int(1, 3);
      const oneWay = dom.oneOf([child]);
      assertThrows(() => oneWay.parse(0), Error, "not in range");
    });
  });
  describe("for a multi-case oneOf", () => {
    const multiWay = dom.oneOf([dom.int(1, 3), dom.int(4, 6)]);
    it("encodes distinct cases by putting the case index first", () => {
      assertEncoding(multiWay, [0, 2], 2);
      assertEncoding(multiWay, [1, 5], 5);
    });
    it("rejects values that don't match any case", () => {
      assertThrows(() => multiWay.parse(0), Error, "no case matched");
    });
  });
});

describe("mapped", () => {
  describe("for even numbers", () => {
    const roll = dom.int(1, 6);

    const even = dom.mapped(roll, {
      parse(v, sendErr) {
        if (typeof v !== "number" || !Number.isSafeInteger(v)) {
          sendErr("not a safe integer");
          return undefined;
        } else if (v % 2 !== 0) {
          sendErr("not an even number");
          return undefined;
        }
        return v / 2;
      },
      unparse(v) {
        return v * 2;
      },
    });

    it("accepts even numbers", () => {
      repeatTest(arb.of(2, 4, 6, 8, 10, 12), (n) => {
        assertRoundTrip(even, n);
      });
    });

    it("rejects odd numbers", () => {
      repeatTest(arb.of(1, 3, 5, 7, 9, 11), (n) => {
        assertThrows(() => even.parse(n), Error, "not an even number");
      });
    });

    it("parses every number it generates", () => {
      repeatTest(even, (n) => {
        even.parse(n);
      });
    });
  });
});
