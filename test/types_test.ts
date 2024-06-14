import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { invalidRange, validRange } from "../src/ranges.ts";
import SimpleRunner from "../src/simple_runner.ts";

import { ChoiceRequest } from "../src/types.ts";

const runner = new SimpleRunner();

describe("ChoiceRequest", () => {
  describe("constructor", () => {
    it("throws when given an invalid range", () => {
      runner.check(invalidRange, ({ min, max }) => {
        assertThrows(() => new ChoiceRequest(min, max));
      });
    });
  });
  describe("default", () => {
    it("returns the default value for a range", () => {
      runner.check(validRange, ({ min, max }) => {
        const request = new ChoiceRequest(min, max);
        assert(request.default >= min);
        assert(request.default <= max);
        if (min >= 0) {
          assertEquals(request.default, min);
        } else if (max <= 0) {
          assertEquals(request.default, max);
        } else {
          assertEquals(request.default, 0);
        }
      });
    });
  });
});
