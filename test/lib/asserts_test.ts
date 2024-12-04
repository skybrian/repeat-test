import { describe, it } from "@std/testing/bdd";
import { dom, Domain } from "@/mod.ts";
import { assertThrows } from "@std/assert/throws";
import { assertRoundTrip } from "./asserts.ts";
import { assert } from "@std/assert/assert";

const roll = dom.int(1, 6);

describe("assertRoundTrip", () => {
  it("throws if pickify fails", () => {
    assertThrows(
      () => assertRoundTrip(roll, 100),
      Error,
      "not in range [1, 6]:\n100",
    );
  });

  it("throws if Gen.build fails", () => {
    const badRoll = Domain.make(roll.buildScript, (val) => {
      assert(typeof val === "number");
      return [val];
    });

    assertThrows(
      () => assertRoundTrip(badRoll, 7),
      Error,
      "can't build 'int(1, 6)': pick 0 didn't satisfy the request. Want: [1, 6]. Got: 7\n[ 7 ]:\n7",
    );
  });
});
