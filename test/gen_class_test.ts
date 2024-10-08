import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { Pruned } from "../src/pickable.ts";
import { PickList, PickRequest } from "../src/picks.ts";
import { keep, replace, snip } from "../src/edits.ts";
import { Script } from "../src/script_class.ts";
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

  describe("segmentCount", () => {
    it("returns 1 for a non-piped script", () => {
      const gen = Gen.mustBuild(bit, [0]);
      assertEquals(gen.segmentCount, 1);
    });
    it("returns 2 for a two-stage pipeline", () => {
      const gen = Gen.mustBuild(bit.then("pipe", (a) => a), [0]);
      assertEquals(gen.segmentCount, 2);
    });
  });

  describe("segmentPicks", () => {
    it("returns the picks for two build steps", () => {
      const gen = Gen.mustBuild(multiStep, [0, 1]);
      assertEquals(gen.val, "(0, 1)");

      const bitReq = PickRequest.bit;
      const first = new PickList([bitReq], [0]);
      const second = new PickList([bitReq], [1]);
      assertEquals(gen.segmentPicks, [first, second]);
    });
  });

  describe("mutate", () => {
    it("returns the same object if there are no edits, for a single segment", () => {
      const gen = Gen.mustBuild(bit, [0]);
      assert(gen.mutate(() => keep) === gen);
      assert(gen.mutate(() => () => keep()) === gen);
    });

    it("returns the same object if there are no edits, for a multiple segments", () => {
      const gen = Gen.mustBuild(multiStep, [0, 0]);
      assert(gen.mutate(() => keep) === gen);
      assert(gen.mutate(() => () => keep()) === gen);
    });

    it("edits a single segment", () => {
      const seed = Gen.mustBuild(bit, [1]);
      const gen = seed.mutate(() => snip);
      assert(gen !== undefined);
      assertEquals(gen.segmentCount, 1);
      assertEquals(gen.replies, [0]);
      assertEquals(gen.val, 0);
    });

    it("edits the first segment of a pipeline", () => {
      const original = Gen.mustBuild(multiStep, [1, 1]);
      const gen = original.mutate((n) => (n === 0) ? snip : keep);
      assert(gen !== undefined);
      assert(gen !== original);
      assertEquals(gen.segmentCount, 2);
      assertEquals(gen.val, "(0, 1)");
      assertEquals(gen.replies, [0, 1]);
    });

    it("edits the last segment of a pipeline", () => {
      const gen = Gen.mustBuild(multiStep, [1, 1]).mutate((n) =>
        (n === 1) ? snip : keep
      );
      assert(gen !== undefined);
      assertEquals(gen.segmentCount, 2);
      assertEquals(gen.replies, [1, 0]);
      assertEquals(gen.val, "(1, 0)");
    });

    const evenRoll = Script.make("evenRoll", (pick) => {
      const roll = pick(new PickRequest(1, 6));
      if (roll % 2 !== 0) {
        throw new Pruned("that's odd");
      }
      return roll;
    });

    const evenDoubles = evenRoll.then("evenDoubles", (a, pick) => {
      const b = pick(new PickRequest(1, 6));
      if (a !== b) {
        throw new Pruned("not a double");
      }
      return [a, b];
    });

    it("returns undefined if the first segment's edit fails", () => {
      const gen = Gen.mustBuild(evenDoubles, [2, 2]);
      assert(
        gen.mutate((i) => (i === 0) ? () => replace(1) : keep) ===
          undefined,
      );
    });

    it("returns undefined if the second segment's edit fails", () => {
      const gen = Gen.mustBuild(evenDoubles, [2, 2]);
      assert(
        gen.mutate((i) => (i === 1) ? () => replace(1) : keep) ===
          undefined,
      );
    });
  });
});
