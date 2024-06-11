import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows, fail } from "@std/assert";

import { NumberStream } from "./mod.ts";

describe("NumberStream", () => {
  describe("unsignedInt", () => {
    const invalidLimits = [-1, 0, 1, 1.5, 2 ** 53 + 2, NaN, Infinity];
    const validLimits = [
      2,
      255,
      256,
      65535,
      65536,
      2 ** 32,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    describe("for an empty stream", () => {
      const stream = new NumberStream(new Uint8Array());
      it("throws for invalid limits", () => {
        for (const limit of invalidLimits) {
          assertThrows(() => stream.unsignedInt(limit), Error);
        }
      });
      it("returns zero for limits that are in range", () => {
        for (const limit of validLimits) {
          assertEquals(stream.unsignedInt(limit), 0);
        }
      });
    });
    describe("for a stream with a single 1 byte", () => {
      it("returns 1 for any valid limit", () => {
        for (const limit of validLimits) {
          const stream = new NumberStream(new Uint8Array([1]));
          assertEquals(stream.unsignedInt(limit), 1);
        }
      });
    });
    describe("for a stream set to limit - 1", () => {
      it("returns the value", () => {
        for (const limit of validLimits) {
          const bytes = new Uint8Array(100);
          const view = new DataView(bytes.buffer);
          view.setBigUint64(0, BigInt(limit - 1), true);
          const stream = new NumberStream(bytes);
          assertEquals(stream.unsignedInt(limit), limit - 1);
        }
      });
    });
    describe("for a stream with all bits set", () => {
      it("throws for invalid limits", () => {
        const stream = new NumberStream(new Uint8Array(100).fill(0xff));
        for (const limit of invalidLimits) {
          assertThrows(() => stream.unsignedInt(limit), Error);
        }
      });
      it("returns a number within range for limits that are in range", () => {
        for (let i = 0; i < 1000; i++) {
          const stream = new NumberStream(new Uint8Array(100).fill(0xff));
          let limit = Math.floor(Math.random() * 2 ** 53);
          while (limit < 2 || limit > 2 ** 53) {
            limit = Math.floor(Math.random() * 2 ** 53);
          }
          const result = stream.unsignedInt(limit);
          if (!Number.isSafeInteger(result) || result < 0 || result >= limit) {
            fail(`unsignedInt(${limit}): got: ${result}`);
          }
        }
      });
      it("returns the maximum value for powers of two", () => {
        for (let power = 1; power <= 53; power++) {
          const stream = new NumberStream(new Uint8Array(100).fill(0xff));
          const limit = 2 ** power;
          assertEquals(stream.unsignedInt(limit), limit - 1, `limit: ${limit}`);
        }
      });
    });
  });
});
