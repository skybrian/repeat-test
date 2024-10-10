import type { Paused } from "../src/script_class.ts";

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { done } from "../src/results.ts";
import { Filtered } from "../src/pickable.ts";
import { PickList, PickRequest, PlaybackPicker } from "../src/picks.ts";
import { keep, replace, replacePick, snip } from "../src/edits.ts";
import { paused, Script } from "../src/script_class.ts";
import { Gen, generate } from "../src/gen_class.ts";
import { propsFromGen } from "./lib/props.ts";
import { minPlayout, onePlayout } from "../src/backtracking.ts";
import { depthFirstPlayouts } from "../src/partial_tracker.ts";
import { orderedPlayouts } from "../src/ordered.ts";
import { randomPicker } from "../src/random.ts";
import { repeatTest } from "../src/runner.ts";

const bitReq = PickRequest.bit;

const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

const roll = Script.make("roll", (pick) => pick(new PickRequest(1, 6)));

const fails = Script.make("fails", () => {
  throw new Error("oops!");
});

const frozen = Script.make("frozen", () => Object.freeze(["frozen"]));

const mutable = Script.make("mutable", () => ["mutable"]);

const pruned = Script.make("never", () => {
  throw new Filtered("nope");
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

function countOnesAt(n: number): Paused<number> {
  return paused((pick) => {
    if (n > 5) {
      throw new Filtered("too many ones");
    }
    if (pick(PickRequest.bit) === 0) {
      return done(n);
    }
    return countOnesAt(n + 1);
  });
}

const countOnes = Script.fromPaused("countOnes", countOnesAt(0));

const pi = Script.constant("pi", Math.PI);

describe("Gen", () => {
  describe("build", () => {
    it("works for a constant", () => {
      const gen = Gen.build(pi, []);
      assert(gen.ok);
      assertEquals(propsFromGen(gen), {
        name: "pi",
        val: Math.PI,
        reqs: [],
        replies: [],
      });
    });
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
    it("works for a constant", () => {
      const gen = Gen.mustBuild(pi, []);
      assertEquals(propsFromGen(gen), {
        name: "pi",
        val: Math.PI,
        reqs: [],
        replies: [],
      });
    });
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
      assertEquals(gen.stepCount, 1);
    });
    it("returns 2 for a two-stage pipeline", () => {
      const gen = Gen.mustBuild(bit.then("pipe", (a) => a), [0]);
      assertEquals(gen.stepCount, 2);
    });
  });

  describe("segmentPicks", () => {
    it("returns the picks for two build steps", () => {
      const gen = Gen.mustBuild(multiStep, [0, 1]);
      assertEquals(gen.val, "(0, 1)");

      const bitReq = PickRequest.bit;
      const first = new PickList([bitReq], [0]);
      const second = new PickList([bitReq], [1]);
      assertEquals(gen.picksByStep, [first, second]);
    });
  });

  describe("mutate", () => {
    it("returns the same value for a constant", () => {
      const gen = Gen.mustBuild(pi, []);
      assertEquals(gen.val, Math.PI);
      assertEquals(gen.stepCount, 0);
      assert(gen.mutate(() => keep) === gen);
    });
    it("returns itself when there are no edits, for a single-step build", () => {
      const gen = Gen.mustBuild(bit, [0]);
      assert(gen.mutate(() => keep) === gen);
      assert(gen.mutate(() => () => keep()) === gen);
    });

    it("returns itself when there are no edits, for a multi-step build", () => {
      const gen = Gen.mustBuild(multiStep, [0, 0]);
      assert(gen.mutate(() => keep) === gen);
      assert(gen.mutate(() => () => keep()) === gen);
    });

    it("can edit a single-step build", () => {
      const seed = Gen.mustBuild(bit, [1]);
      const gen = seed.mutate(() => snip);
      assert(gen !== undefined);
      assertEquals(gen.stepCount, 1);
      assertEquals(gen.replies, [0]);
      assertEquals(gen.val, 0);
    });

    it("can edit the first step of a two-step build", () => {
      const original = Gen.mustBuild(multiStep, [1, 1]);
      const gen = original.mutate((n) => (n === 0) ? snip : keep);
      assert(gen !== undefined);
      assert(gen !== original);
      assertEquals(gen.stepCount, 2);
      assertEquals(gen.val, "(0, 1)");
      assertEquals(gen.replies, [0, 1]);
    });

    it("can edit the last step of a two-step build", () => {
      const gen = Gen.mustBuild(multiStep, [1, 1]).mutate((n) =>
        (n === 1) ? snip : keep
      );
      assert(gen !== undefined);
      assertEquals(gen.stepCount, 2);
      assertEquals(gen.replies, [1, 0]);
      assertEquals(gen.val, "(1, 0)");
    });

    const evenRoll = Script.make("evenRoll", (pick) => {
      const roll = pick(new PickRequest(1, 6));
      if (roll % 2 !== 0) {
        throw new Filtered("that's odd");
      }
      return roll;
    });

    const evenDoubles = evenRoll.then("evenDoubles", (a, pick) => {
      const b = pick(new PickRequest(1, 6));
      if (a !== b) {
        throw new Filtered("not a double");
      }
      return [a, b];
    });

    it("returns undefined if editing the first step fails", () => {
      const gen = Gen.mustBuild(evenDoubles, [2, 2]);
      assert(
        gen.mutate((i) => (i === 0) ? () => replace(1) : keep) ===
          undefined,
      );
    });

    it("returns undefined if editing the second step fails", () => {
      const gen = Gen.mustBuild(evenDoubles, [2, 2]);
      assert(
        gen.mutate((i) => (i === 1) ? () => replace(1) : keep) ===
          undefined,
      );
    });

    it("mutates a multi-step build to have fewer steps", () => {
      const before = Gen.mustBuild(countOnes, [1, 1, 1, 0]);
      assertEquals(before.val, 3);

      const after = before.mutate((i) => (i === 1) ? snip : keep);
      assertEquals(propsFromGen(after), {
        val: 1,
        name: "countOnes",
        reqs: [PickRequest.bit, PickRequest.bit],
        replies: [1, 0],
      });
    });

    it("mutates a multi-step build to have more steps", () => {
      const before = Gen.mustBuild(countOnes, [1, 0]);
      assertEquals(before.val, 1);

      const after = before.mutate(replacePick(1, 0, 1));
      assertEquals(propsFromGen(after), {
        val: 2,
        name: "countOnes",
        reqs: [PickRequest.bit, PickRequest.bit, PickRequest.bit],
        replies: [1, 1, 0],
      });
    });

    it("returns undefined if a new step fails", () => {
      const before = Gen.mustBuild(countOnes, [1, 1, 1, 1, 1, 0]);
      assertEquals(before.val, 5);
      assertEquals(before.stepCount, 6);

      assertEquals(before.mutate(replacePick(5, 0, 1)), undefined);
    });
  });
});

describe("generate", () => {
  describe("for Script.make", () => {
    const hello = Script.make("hello", () => "hi");

    it("generates a single value for a constant", () => {
      const gen = generate(hello, minPlayout());
      assertEquals(propsFromGen(gen), {
        val: "hi",
        name: "hello",
        reqs: [],
        replies: [],
      });
    });

    it("can generate two bits in different playouts", () => {
      const playouts = depthFirstPlayouts();

      const gen1 = generate(bit, playouts);
      assertEquals(propsFromGen(gen1), {
        val: 0,
        name: "bit",
        reqs: [bitReq],
        replies: [0],
      });
      assertEquals(playouts.depth, 1);

      playouts.endPlayout();
      assertEquals(playouts.state, "playoutDone");
      assertEquals(0, playouts.depth);

      const gen2 = generate(bit, playouts);
      assertEquals(propsFromGen(gen2), {
        val: 1,
        name: "bit",
        reqs: [bitReq],
        replies: [1],
      });
    });

    it("can limit generation to the provided number of picks", () => {
      const biased = new PickRequest(0, 1, {
        bias: () => 1,
      });

      const deep = Script.make("deep", (pick) => {
        let picks = 0;
        while (pick(biased) === 1) {
          picks++;
        }
        return picks;
      });

      repeatTest(new PickRequest(0, 10000), (limit) => {
        const gen = generate(deep, onePlayout(randomPicker(123)), { limit });
        assert(gen !== undefined);
        assertEquals(gen.val, limit);
      }, { reps: 100 });
    });

    it("passes through an error thrown by the PickSet", () => {
      assertThrows(
        () => generate(fails, depthFirstPlayouts()),
        Error,
        "oops",
      );
    });

    const rejectAll = Script.make("rejectAll", () => {
      throw new Filtered("nope");
    });

    it("returns undefined if there are no matching playouts", () => {
      const playouts = depthFirstPlayouts();
      assertEquals(generate(rejectAll, playouts), undefined);
    });
  });

  describe("for Script.then", () => {
    it("generates all values", () => {
      const playouts = orderedPlayouts();
      for (const expectedReplies of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const gen = generate(multiStep, playouts);
        assertEquals(propsFromGen(gen), {
          val: `(${expectedReplies[0]}, ${expectedReplies[1]})`,
          name: "multi-step",
          reqs: [bitReq, bitReq],
          replies: expectedReplies,
        });
      }
      assertFalse(generate(multiStep, playouts));
    });

    it("retries for a pruned multi-step build script", () => {
      const pruned = bit.then("pruned", (val) => {
        if (val === 0) {
          throw new Filtered("try again");
        }
        return val;
      });
      const gen = generate(pruned, orderedPlayouts());
      assertEquals(propsFromGen(gen), {
        val: 1,
        name: "pruned",
        reqs: [bitReq],
        replies: [1],
      });
    });

    it("regenerates the same value the second time", () => {
      const script = frozen.then(
        "untitled",
        (val, pick) => val.concat(["" + pick(PickRequest.bit)]),
      );

      const gen = generate(script, minPlayout());

      assertEquals(propsFromGen(gen), {
        name: "untitled",
        reqs: [PickRequest.bit],
        replies: [0],
        val: ["frozen", "0"],
      });

      assert(gen !== undefined);
      const first = gen.val;
      assertEquals(first, ["frozen", "0"]);

      const second = gen.val;
      assertEquals(second, first);
      assertFalse(second === first);
    });

    it("fails when the rule throws an error", () => {
      const script = bit.then("untitled", () => {
        throw new Error("oops");
      });

      const picks = onePlayout(new PlaybackPicker([]));
      assertThrows(
        () => generate(script, picks),
        Error,
        "oops",
      );
    });

    it("fails when all playouts were rejected", () => {
      const script = bit.then("untitled", () => {
        throw new Filtered("nope");
      });

      const gen = generate(
        script,
        onePlayout(new PlaybackPicker([])),
      );
      assert(gen === undefined);
    });
  });

  describe("for Script.fromPaused", () => {
    it("generates values with increasing depth", () => {
      const script = countOnes;
      const playouts = orderedPlayouts();
      for (let i = 0; i < 5; i++) {
        const gen = generate(script, playouts);
        assertEquals(propsFromGen(gen), {
          val: i,
          name: `countOnes`,
          reqs: new Array(i + 1).fill(bitReq),
          replies: new Array(i).fill(1).concat([0]),
        });
      }
    });
  });
});
