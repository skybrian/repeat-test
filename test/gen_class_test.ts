import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { noChange, PickList, PickRequest } from "../src/picks.ts";
import { Pruned } from "../src/backtracking.ts";
import { Script } from "../src/build.ts";
import { Gen } from "../src/gen_class.ts";

const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

const roll = Script.make("roll", (pick) => pick(new PickRequest(1, 6)));

const frozen = Script.make("frozen", () => Object.freeze(["frozen"]));

const mutable = Script.make("mutable", () => ["mutable"]);

const pruned = Script.make("never", () => {
  throw new Pruned("nope");
});

const multiStep = bit.then("multi-step", (a, pick) => {
  const b = pick(PickRequest.bit);
  return `(${a}, ${b})`;
});

const frozenFirstStep = frozen.then("frozen-first-step", (a) => {
  return [a];
});

const multiStepMutable = mutable.then(
  "multi-step mutable",
  (a) => {
    return [...a, "!"];
  },
);

const firstStepPruned = pruned.then(
  "first-step-pruned",
  (a, pick) => {
    const b = pick(PickRequest.bit);
    return `(${a}, ${b})`;
  },
);

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

    it("doesn't regenerate a frozen previous step", () => {
      const gen = Gen.mustBuild(frozenFirstStep, []);
      const first = gen.val;
      assertEquals(first, [["frozen"]]);
      const second = gen.val;
      assertFalse(second === first);
      assert(second[0] === first[0]);
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
