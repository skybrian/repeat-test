import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";

import TestRunner from "../src/simple_runner.ts";
import * as arb from "../src/arbitraries.ts";
import { validRequest } from "../src/requests.ts";

import { ArrayChoices } from "../src/parser.ts";

const runner = new TestRunner();

describe("ArrayChoices", () => {
  describe("next", () => {
    describe("for an empty array", () => {
      const stream = new ArrayChoices([]);
      it("chooses the request's default and fails", () => {
        runner.repeat(validRequest, (req) => {
          assertEquals(stream.next(req), req.default);
          assert(stream.failed);
          assertEquals(stream.errorOffset, 0);
        });
      });
    });
    describe("for an array containing a safe integer", () => {
      describe("when the choice is valid", () => {
        it("returns it", () => {
          const example = arb.custom((it) => {
            const req = it.gen(validRequest);
            const n = it.gen(arb.biasedInt(req.min, req.max));
            const stream = new ArrayChoices([n]);
            return { req, n, stream };
          });
          runner.repeat(example, ({ req, n, stream }) => {
            assertEquals(stream.next(req), n);
          });
        });
      });
      describe("when the choice is invalid", () => {
        it("chooses the request's default and fails", () => {
          const example = arb.custom((it) => {
            const req = it.gen(validRequest);
            const n = it.gen(arb.intOutsideRange(req.min, req.max));
            const stream = new ArrayChoices([n]);
            return { req, stream };
          });
          runner.repeat(example, ({ req, stream }) => {
            assertEquals(stream.next(req), req.default);
            assert(stream.failed);
            assertEquals(stream.errorOffset, 0);
          });
        });
      });
    });
  });
});
