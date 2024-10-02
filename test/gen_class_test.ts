import { buildStep, type PickSet } from "../src/build.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

import { noChange, PickList } from "../src/picks.ts";
import { Pruned } from "../src/backtracking.ts";
import { PickRequest } from "@/arbitrary.ts";

import { Gen } from "../src/gen_class.ts";

const bit: PickSet<number> = {
  label: "bit",
  buildScript: (pick) => pick(PickRequest.bit),
};

const roll: PickSet<number> = {
  label: "roll",
  buildScript: (pick) => pick(new PickRequest(1, 6)),
};

const frozen: PickSet<readonly string[]> = {
  label: "frozen",
  buildScript: () => Object.freeze(["frozen"]),
};

const mutable: PickSet<string[]> = {
  label: "mutable",
  buildScript: () => ["mutable"],
};

const pruned: PickSet<number> = {
  label: "never",
  buildScript: () => {
    throw new Pruned("nope");
  },
};

const multiStep: PickSet<string> = {
  label: "multi-step",
  buildScript: buildStep(bit, (a, pick) => {
    const b = pick(bit);
    return `(${a}, ${b})`;
  }),
};

const multiStepMutable: PickSet<string[]> = {
  label: "multi-step mutable",
  buildScript: buildStep(mutable, (a: string[]) => {
    return [...a, "!"];
  }),
};

const firstStepPruned: PickSet<string> = {
  label: "first-step-pruned",
  buildScript: {
    input: pruned,
    then: (a, pick) => {
      const b = pick(bit);
      return `(${a}, ${b})`;
    },
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

    describe("with multiple steps", () => {
      it("fails when there aren't enough picks", () => {
        assertThrows(
          () => Gen.mustBuild(multiStep, []),
          Error,
          "can't build 'multi-step': ran out of picks",
        );
      });

      it("fails when the first step was pruned", () => {
        assertThrows(
          () => Gen.mustBuild(firstStepPruned, [0]),
          Error,
          "can't build 'first-step-pruned': read only 0 of 1 available picks",
        );
      });
    });
  });

  describe("splitPicks", () => {
    it("returns the picks for two build steps", () => {
      const gen = Gen.mustBuild(multiStep, [0, 1]);
      assertEquals(gen.val, "(0, 1)");

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

    it("regenerates using multiple steps", () => {
      const gen = Gen.mustBuild(multiStepMutable, []);
      const first = gen.val;
      assertEquals(first, ["mutable", "!"]);
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
