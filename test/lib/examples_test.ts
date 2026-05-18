import { assertThrows } from "@std/assert/throws";
import { describe, it } from "@std/testing/bdd";
import { Arbitrary } from "../../src/arbitrary_class.ts";
import { Filtered } from "../../src/pickable.ts";
import { IntRequest } from "../../src/picks.ts";
import { assertValues } from "./asserts.ts";
import { takeAll } from "./examples.ts";

describe("takeAll", () => {
  it("returns the only value of a constant", () => {
    const one = Arbitrary.from(() => 1);
    assertValues(one, [1]);
  });

  const bit = Arbitrary.from(new IntRequest(0, 1));
  it("returns both bit values", () => {
    assertValues(bit, [0, 1]);
  });

  it("handles a mapped Arbitrary", () => {
    const bool = bit.map((b) => b == 1);
    assertValues(bool, [false, true]);
  });

  it("handles filtering by throwing an exception", () => {
    const notTwo = Arbitrary.from((pick) => {
      const n = pick(new IntRequest(1, 3));
      if (n === 2) throw new Filtered("skip 2");
      return n;
    });
    assertValues(notTwo, [1, 3]);
  });

  it("handles a filtered Arbitrary", () => {
    const zero = bit.filter((b) => b === 0);
    assertValues(zero, [0]);
  });

  it("handles a chained Arbitrary", () => {
    const hello = bit.chain((val) => {
      if (val === 1) {
        return Arbitrary.from(() => "there");
      } else {
        return Arbitrary.from(() => "hi");
      }
    });
    assertValues(hello, ["hi", "there"]);
  });

  it("throws an exception if it can't find a value", () => {
    const letters = Arbitrary.of("a", "b", "c");
    assertThrows(
      () => takeAll(letters, { limit: 2 }),
      Error,
      "takeAll for '3 examples': array would have more than 2 elements",
    );
  });
});
