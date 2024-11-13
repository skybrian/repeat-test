import type { Pickable } from "../../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertThrows } from "@std/assert";
import { scriptFrom } from "../../src/scripts/scriptFrom.ts";

describe("scriptFrom", () => {
  it("throws if given an invalid argument", () => {
    assertThrows(
      () => scriptFrom(null as unknown as Pickable<number>),
      Error,
      "Script.from() called with an invalid argument",
    );
  });
});
