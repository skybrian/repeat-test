import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  biasedBitRequest,
  Gen,
  IntRequest,
  type RandomSource,
  Script,
} from "@skybrian/repeat-test/core";
import { repeatTest } from "@skybrian/repeat-test/runner";
import { invalidIntRange } from "./support/ranges.ts";

describe("IntRequest", () => {
  it("accepts inclusive non-negative safe integer ranges", () => {
    for (
      const [min, max] of [
        [0, 0],
        [0, 1],
        [7, 10],
        [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      ]
    ) {
      const req = new IntRequest(min, max);
      assert.equal(req.min, min);
      assert.equal(req.max, max);
      assert.equal(req.size, max - min + 1);
      assert.equal(req.inRange(min), true);
      assert.equal(req.inRange(max), true);
      assert.equal(req.toString(), `${min}..${max}`);
    }
  });

  it("rejects negative, unsafe, non-integer, and reversed ranges", () => {
    const invalid: [number, number][] = [[-1, 1], [1, 0]];
    for (
      const n of [
        -0.5,
        0.5,
        NaN,
        Infinity,
        -Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      invalid.push([n, 1], [0, n]);
    }
    for (const [min, max] of invalid) {
      assert.throws(() => new IntRequest(min, max), Error);
    }
  });

  it("rejects generated invalid ranges", () => {
    repeatTest(invalidIntRange({ minMin: 0 }), ({ min, max }) => {
      assert.throws(() => new IntRequest(min, max), Error);
    }, { reps: 32 });
  });

  it("inRange checks inclusive bounds and safe integer membership", () => {
    const req = new IntRequest(2, 5);
    for (const n of [2, 3, 4, 5]) {
      assert.equal(req.inRange(n), true);
    }
    for (
      const n of [
        -1,
        0,
        1,
        6,
        2.5,
        NaN,
        Infinity,
        -Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.equal(req.inRange(n), false, `inRange(${n})`);
    }
  });

  it("bit requests exactly 0 or 1", () => {
    const bit = IntRequest.bit;
    assert.equal(bit.min, 0);
    assert.equal(bit.max, 1);
    assert.equal(bit.size, 2);
    assert.equal(bit.inRange(0), true);
    assert.equal(bit.inRange(1), true);
    assert.equal(bit.inRange(-1), false);
    assert.equal(bit.inRange(2), false);
    assert.equal(bit.toString(), "0..1");
  });

  it("directBuild delegates to the supplied pick function", () => {
    const req = new IntRequest(3, 5);
    const script = Script.make(
      "direct request",
      (pick) => req.directBuild(pick),
    );
    for (const value of [3, 4, 5]) {
      assert.equal(Gen.mustBuild(script, [value]).val, value);
    }
  });

  describe("random", () => {
    it("returns the only value for singleton ranges without randomness", () => {
      for (const value of [0, 1, 1000, Number.MAX_SAFE_INTEGER]) {
        const source = () => {
          assert.fail("a singleton needs no randomness");
        };
        assert.equal(new IntRequest(value, value).random(source), value);
      }
    });

    it("returns in-range integers for small and large ranges", () => {
      for (
        const req of [
          IntRequest.bit,
          new IntRequest(7, 12),
          new IntRequest(1000, 1127),
          new IntRequest(0, Number.MAX_SAFE_INTEGER),
        ]
      ) {
        for (const input of [-0x80000000, -123, 0, 123]) {
          let calls = 0;
          const value = req.random(() => {
            assert.ok(++calls <= 8, "random source budget exceeded");
            return input;
          });
          assert.equal(req.inRange(value), true);
        }
      }
    });

    it("uses a custom bias and passes it the supplied random source", () => {
      const source: RandomSource = () => -123;
      let calls = 0;
      const req = new IntRequest(10, 20, {
        bias: (next) => {
          calls++;
          assert.strictEqual(next, source);
          assert.equal(next(), -123);
          return 17;
        },
      });
      assert.equal(req.random(source), 17);
      assert.equal(calls, 1);
    });
  });
});

describe("biasedBitRequest", () => {
  it("has the same range as a bit request", () => {
    const req = biasedBitRequest(0.5);
    assert.equal(req.min, 0);
    assert.equal(req.max, 1);
    assert.equal(req.size, 2);
  });

  it("switches at the midpoint for a fair coin", () => {
    const req = biasedBitRequest(0.5);
    assert.equal(req.random(() => -1), 0);
    assert.equal(req.random(() => 0), 1);
  });

  it("moves the threshold when the probability of one increases", () => {
    const req = biasedBitRequest(0.75);
    assert.equal(req.random(() => -0x40000001), 0);
    assert.equal(req.random(() => -0x40000000), 1);
    assert.equal(req.random(() => 0), 1);
  });

  it("favors zero with a one-in-ten probability of one", () => {
    const req = biasedBitRequest(0.1);
    for (const input of [-0x80000000, 0, 0x60000000]) {
      assert.equal(req.random(() => input), 0);
    }
    for (const input of [0x70000000, 0x7fffffff]) {
      assert.equal(req.random(() => input), 1);
    }
  });

  it("always returns the specified bit at probability endpoints", () => {
    for (const input of [-0x80000000, -1, 0, 0x7fffffff]) {
      assert.equal(biasedBitRequest(0).random(() => input), 0);
      assert.equal(biasedBitRequest(1).random(() => input), 1);
    }
  });
});
