import type { Pickable } from "../../src/pickable.ts";

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { scriptFrom } from "../../src/scripts/scriptFrom.ts";
import { PickRequest } from "@/arbitrary.ts";
import { usePicks } from "../../src/build.ts";

describe("scriptFrom", () => {
  it("throws if given an invalid argument", () => {
    assertThrows(
      () => scriptFrom(null as unknown as Pickable<number>),
      Error,
      "Script.from() called with an invalid argument",
    );
  });

  it("works with a PickRequest", () => {
    const script = scriptFrom(new PickRequest(1, 6));
    assertEquals(1, script.directBuild(usePicks(1)));
  });
});
