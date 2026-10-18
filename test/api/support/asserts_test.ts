import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Domain, IntRequest } from "@skybrian/repeat-test/core";
import * as dom from "@skybrian/repeat-test/doms";
import { assertRoundTrip, assertThrows } from "./asserts.ts";

describe("API test assertions", () => {
  describe("assertThrows", () => {
    it("matches the class and message substring and returns the error", () => {
      const error = new TypeError("before expected after");
      assert.strictEqual(
        assertThrows(
          () => {
            throw error;
          },
          TypeError,
          "expected",
        ),
        error,
      );
    });

    it("rejects a callback that does not throw", () => {
      assert.throws(() => assertThrows(() => {}), assert.AssertionError);
    });

    it("rejects the wrong error class even when the message matches", () => {
      assert.throws(
        () =>
          assertThrows(
            () => {
              throw new Error("expected");
            },
            TypeError,
            "expected",
          ),
        assert.AssertionError,
      );
    });

    it("rejects the wrong message even when the class matches", () => {
      assert.throws(
        () =>
          assertThrows(
            () => {
              throw new TypeError("unexpected");
            },
            TypeError,
            "missing",
          ),
        assert.AssertionError,
      );
    });

    it("rejects a thrown non-error value", () => {
      assert.throws(
        () =>
          assertThrows(() => {
            throw "expected";
          }),
        assert.AssertionError,
      );
    });
  });

  describe("assertRoundTrip", () => {
    it("checks nested values through the public pick and build APIs", () => {
      assertRoundTrip(dom.object({ values: dom.array(dom.int(0, 3)) }), {
        values: [0, 1, 3],
      });
    });

    it("rejects values outside the domain", () => {
      assert.throws(
        () => assertRoundTrip(dom.int(0, 1), 2),
        assert.AssertionError,
      );
    });

    it("rejects a parser whose picks rebuild a different value", () => {
      const broken = Domain.make(IntRequest.bit, () => [0], { lazyInit: true });
      assert.throws(() => assertRoundTrip(broken, 1), assert.AssertionError);
    });
  });
});
