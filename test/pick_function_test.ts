import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import { minPlayout, Pruned } from "../src/backtracking.ts";
import { PlayoutSearch } from "../src/searches.ts";
import Arbitrary from "../src/arbitrary_class.ts";
import { makePickFunction } from "../src/pick_function.ts";
import { assertThrows } from "@std/assert";

const bit = new PickRequest(0, 1);
const hi = Arbitrary.of("hi", "there");

describe("makePickFunction", () => {
  let pick = makePickFunction(minPlayout());

  beforeEach(() => {
    const search = new PlayoutSearch();
    search.startAt(0);
    pick = makePickFunction(search);
  });

  it("accepts a PickRequest", () => {
    assertEquals(pick(bit), 0);
  });

  it("accepts an Arbitrary", () => {
    assertEquals(pick(hi), "hi");
  });

  it("filters an Arbitrary", () => {
    const accept = (x: string) => x !== "hi";
    assertEquals(pick(hi, { accept }), "there");
  });

  it("can filter out every value", () => {
    const accept = () => false;
    assertThrows(() => pick(hi, { accept }), Pruned);
  });

  it("retries a pick with a different playout", () => {
    const roll = new PickRequest(1, 6);
    const arb = Arbitrary.from((pick) => {
      const n = pick(roll);
      if (n === 3) {
        throw new Pruned("try again");
      }
      return n;
    });

    const search = new PlayoutSearch();
    search.pickSource = alwaysPick(3);
    search.startAt(0);
    pick = makePickFunction(search);

    assertEquals(pick(arb), 4);
  });
});
