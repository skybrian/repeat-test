import type { PickSet } from "../src/generated.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { noChange } from "../src/picks.ts";
import { minPlayout, onePlayout, Pruned } from "../src/backtracking.ts";
import { PickRequest } from "@/arbitrary.ts";

import { Gen } from "../src/gen_class.ts";
import { propsFromGen } from "./lib/props.ts";
import { PlaybackPicker } from "../src/picks.ts";

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

    describe("mustBuild", () => {
      it("fails when there aren't enough picks", () => {
        assertThrows(
          () => Gen.mustBuild(bit, []),
          Error,
          "can't build 'bit': ran out of picks",
        );
      });
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

  describe("thenGenerate", () => {
    it("generates a value when called", () => {
      const gen = Gen.mustBuild(bit, [0]);

      const then = gen.thenGenerate(
        (val, pick) => `${val}, ${pick(PickRequest.bit)}`,
        minPlayout(),
      );
      assert(then !== undefined);
      assertEquals(propsFromGen(then), {
        label: "untitled",
        reqs: [PickRequest.bit, PickRequest.bit],
        replies: [0, 0],
        val: `0, 0`,
      });
    });

    it("regenerates the same value the second time", () => {
      const gen = Gen.mustBuild(frozen, []);

      const then = gen.thenGenerate(
        (val, pick) => val.concat(["" + pick(PickRequest.bit)]),
        minPlayout(),
      );
      assert(then !== undefined);
      assertEquals(propsFromGen(then), {
        label: "untitled",
        reqs: [PickRequest.bit],
        replies: [0],
        val: ["frozen", "0"],
      });

      const first = then.val;
      assertEquals(first, ["frozen", "0"]);
      const second = then.val;
      assertEquals(second, first);
      assertFalse(second === first);
    });

    it("fails when the rule throws an error", () => {
      const gen = Gen.mustBuild(bit, [0]);
      const rule = () => {
        throw new Error("oops");
      };
      const input = onePlayout(new PlaybackPicker([]));
      assertThrows(() => gen.thenGenerate(rule, input), Error, "oops");
    });

    it("fails when all playouts were rejected", () => {
      const gen = Gen.mustBuild(bit, [0]);
      const rule = () => {
        throw new Pruned("nope");
      };
      const then = gen.thenGenerate(rule, onePlayout(new PlaybackPicker([])));
      assert(then === undefined);
    });
  });
});
