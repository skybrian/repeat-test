import { assertThrows } from "@std/assert/throws";
import { describe, it } from "@std/testing/bdd";
import { IntRequest } from "../../src/picks.ts";
import { alwaysPick } from "./picks.ts";

describe("alwaysPick", () => {
  it("throws if the pick isn't within the range", () => {
    const threes = alwaysPick(3);
    assertThrows(
      () => threes.pick(new IntRequest(0, 1)),
      Error,
      "can't satisfy request (0, 1) with 3",
    );
  });
});
