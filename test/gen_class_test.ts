import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { filtered } from "../src/results.ts";
import { Filtered } from "../src/pickable.ts";
import { PickRequest, PickView, PlaybackPicker } from "../src/picks.ts";
import { keep, replace, snip } from "../src/edits.ts";
import { Script } from "../src/script_class.ts";
import { Gen, generate } from "../src/gen_class.ts";
import { propsFromGen } from "./lib/props.ts";
import { minPlayout, onePlayout } from "../src/backtracking.ts";
import { depthFirstPlayouts } from "../src/partial_tracker.ts";
import { orderedPlayouts } from "../src/ordered.ts";
import { randomPicker } from "../src/random.ts";
import { repeatTest } from "../src/runner.ts";

const bitReq = PickRequest.bit;

const bit = Script.make("bit", (pick) => pick(PickRequest.bit));

const rollReq = new PickRequest(1, 6);

const roll = Script.make("roll", (pick) => pick(rollReq));

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

  describe("stepKeys", () => {
    it("returns a single key for a non-piped script", () => {
      const gen = Gen.mustBuild(bit, [0]);
      assertEquals(gen.stepKeys, [0]);
    });
  });

  describe("getPicks", () => {
    it("returns empty for an unknown key", () => {
      const gen = Gen.mustBuild(multiStep, [0, 1]);
      assert(gen.getPicks(2) === PickView.empty);
    });
  });

  describe("toMutable", () => {
    it("returns a mutable with the same gen", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = original.toMutable();
      assert(mut.gen === original);
    });
  });
});

describe("MutableGen", () => {
  describe("tryMutate", () => {
    it("keeps the same gen when there are no edits, for a single-step build", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = original.toMutable();

      assert(mut.tryMutate(() => keep));
      assert(mut.gen === original);

      assert(mut.tryMutate(() => () => keep()));
      assert(mut.gen === original);
    });

    it("keeps the same gen when there are no edits, for a multi-step build", () => {
      const original = Gen.mustBuild(multiStep, [0, 0]);
      const mut = original.toMutable();

      assert(mut.tryMutate(() => keep));
      assert(mut.gen === original);

      assert(mut.tryMutate(() => () => keep()));
      assert(mut.gen === original);
    });

    it("can edit a single-step build", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = original.toMutable();
      assert(mut.tryMutate(() => snip));
      assertEquals(propsFromGen(mut.gen), {
        name: "bit",
        val: 0,
        reqs: [PickRequest.bit],
        replies: [0],
      });
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

    it("fails if editing the first step fails", () => {
      const original = Gen.mustBuild(evenDoubles, [2, 2]);
      const mut = original.toMutable();
      assertFalse(mut.tryMutate((i) => (i === 0) ? () => replace(1) : keep));
      assert(mut.gen === original);
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
        assert(gen !== filtered);
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

    it("returns filtered if there are no matching playouts", () => {
      const playouts = depthFirstPlayouts();
      assertEquals(propsFromGen(generate(rejectAll, playouts)), filtered);
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
      assertEquals(generate(multiStep, playouts), filtered);
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

      assert(gen !== filtered);
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
      assertEquals(gen, filtered);
    });
  });
});
