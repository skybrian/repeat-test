import type { PickSet } from "../src/generated.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { noChange, PickList } from "../src/picks.ts";
import { Pruned } from "../src/backtracking.ts";
import { PickRequest } from "@/arbitrary.ts";

import { Gen } from "../src/gen_class.ts";

const bit: PickSet<number> = {
  label: "bit",
  generateFrom: (pick) => pick(PickRequest.bit),
};

const roll: PickSet<number> = {
  label: "roll",
  generateFrom: (pick) => pick(new PickRequest(1, 6)),
};

const frozen: PickSet<readonly string[]> = {
  label: "frozen",
  generateFrom: () => Object.freeze(["frozen"]),
};

const mutable: PickSet<string[]> = {
  label: "mutable",
  generateFrom: () => ["mutable"],
};

const pruned: PickSet<number> = {
  label: "never",
  generateFrom: () => {
    throw new Pruned("nope");
  },
};

describe("Gen", () => {
  describe("build", () => {
    it("fails when there aren't enough picks", () => {
      assertEquals(
        Gen.build(bit, []),
        {
          ok: false,
          message: "can't build 'bit': ran out of picks",
        },
      );
    });
    it("fails when the picks were pruned", () => {
      assertEquals(
        Gen.build(pruned, []),
        {
          ok: false,
          message: "can't build 'never': picks not accepted",
        },
      );
    });
    it("throws when too many values were supplied", () => {
      assertEquals(
        Gen.build(bit, [1, 1]),
        {
          ok: false,
          message: "can't build 'bit': read only 1 of 2 available picks",
        },
      );
    });
    it("throws for an out-of-range value", () => {
      assertEquals(
        Gen.build(roll, [7]),
        {
          ok: false,
          message:
            "can't build 'roll': pick 0 didn't satisfy the request. Want: [1, 6]. Got: 7",
        },
      );
    });
  });

  describe("mustBuild", () => {
    it("fails when there aren't enough picks", () => {
      assertThrows(
        () => Gen.mustBuild(bit, []),
        Error,
        "can't build 'bit': ran out of picks",
      );
    });
  });

  describe("thenMustBuild", () => {
    it("fails when there aren't enough picks", () => {
      const input = Gen.mustBuild(bit, [0]);
      assertThrows(
        () =>
          input.thenMustBuild(
            (a, pick) => [a, pick(PickRequest.bit)],
            [],
          ),
        Error,
        "build step failed: ran out of picks",
      );
    });

    it("fails when the picks were pruned", () => {
      const input = Gen.mustBuild(bit, [0]);
      assertThrows(
        () =>
          input.thenMustBuild(() => {
            throw new Pruned("nope");
          }, []),
        Error,
        "build step failed: picks not accepted",
      );
    });
  });

  describe("splitPicks", () => {
    it("returns the picks for two build steps", () => {
      const gen = Gen.mustBuild(bit, [0]).thenMustBuild(
        (a, pick) => [a, pick(PickRequest.bit)],
        [1],
      );
      assertEquals(gen.val, [0, 1]);

      const bitReq = PickRequest.bit;
      const first = new PickList([bitReq], [0]);
      const second = new PickList([bitReq], [1]);
      assertEquals(gen.splitPicks, [first, second]);
    });
  });

  describe("val", () => {
    it("doesn't regenerate a frozen object", () => {
      const gen = Gen.mustBuild(frozen, []);
      const first = gen.val;
      assertEquals(first, ["frozen"]);
      assert(gen.val === first);
    });

    it("regenerates a mutable object", () => {
      const gen = Gen.mustBuild(mutable, []);
      const first = gen.val;
      assertEquals(first, ["mutable"]);
      assert(gen.val !== first);
    });
  });

  describe("mutate", () => {
    it("does nothing if there are no edits", () => {
      const gen = Gen.mustBuild(frozen, []);
      assertEquals(gen.mutate(noChange), undefined);
    });
  });
});
