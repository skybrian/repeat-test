import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { filtered } from "../src/results.ts";
import { Filtered } from "../src/pickable.ts";
import { PickRequest, PlaybackPicker } from "../src/picks.ts";
import { keep, replace, snip } from "../src/edits.ts";
import { Script } from "../src/script_class.ts";
import { Gen, generate, MutableGen } from "../src/gen_class.ts";
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

const twoBits = Script.make("twoBits", (pick) => {
  const a = pick(PickRequest.bit);
  const b = pick(PickRequest.bit);
  return `(${a}, ${b})`;
}, { logCalls: true });

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
    it("fails when the script never returns", () => {
      assertEquals(
        Gen.build(Script.neverReturns, []),
        {
          ok: false,
          message: "can't build 'neverReturns': picks not accepted",
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

    describe("with a splitable script", () => {
      it("fails when there aren't enough picks", () => {
        assertThrows(
          () => Gen.mustBuild(twoBits, []),
          Error,
          "can't build 'twoBits': ran out of picks",
        );
      });

      const firstPickFiltered = Script.make(
        "firstPickFiltered",
        (pick) => {
          const a = pick(Script.neverReturns);
          const b = pick(PickRequest.bit);
          return `(${a}, ${b})`;
        },
      );

      it("fails when the first pick threw Filtered", () => {
        assertThrows(
          () => Gen.mustBuild(firstPickFiltered, [0]),
          Error,
          "can't build 'firstPickFiltered': read only 0 of 1 available picks",
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

    const usesMutable = Script.make("usesMutable", (pick) => {
      const a = pick(mutable);
      return [a[0] + "!"];
    }, { logCalls: true });

    it("regenerates without caching when picking from a mutable", () => {
      const gen = Gen.mustBuild(usesMutable, []);
      const first = gen.val;
      assertEquals(first, ["mutable!"]);
      assert(gen.val !== first);
    });
  });

  describe("toMutable", () => {
    it("returns a mutable with the same gen", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = MutableGen.from(original);
      assert(mut.gen === original);
    });
  });
});

describe("MutableGen", () => {
  describe("tryEdits", () => {
    it("keeps the same gen when there are no edits, for a single-group build", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = MutableGen.from(original);

      assert(mut.tryEdits(() => keep));
      assert(mut.gen === original);

      assert(mut.tryEdits(() => () => keep()));
      assert(mut.gen === original);
    });

    it("keeps the same gen when there are no edits, for a two-group build", () => {
      const original = Gen.mustBuild(twoBits, [0, 0]);
      const mut = MutableGen.from(original);

      assert(mut.tryEdits(() => keep));
      assert(mut.gen === original);

      assert(mut.tryEdits(() => () => keep()));
      assert(mut.gen === original);
    });

    it("can edit a single-step build", () => {
      const original = Gen.mustBuild(bit, [1]);
      const mut = MutableGen.from(original);
      assert(mut.tryEdits(() => snip));
      assertEquals(propsFromGen(mut.gen), {
        name: "bit",
        val: 0,
        reqs: [PickRequest.bit],
        replies: [0],
      });
    });

    it("can edit the first group of a two-group build", () => {
      const original = Gen.mustBuild(twoBits, [1, 1]);
      assertEquals(original.val, `(1, 1)`);

      const mut = MutableGen.from(original);
      assert(mut.tryEdits((i) => i === 0 ? snip : keep));
      assertEquals(propsFromGen(mut.gen), {
        name: "twoBits",
        val: `(0, 1)`,
        reqs: [PickRequest.bit, PickRequest.bit],
        replies: [0, 1],
      });
    });

    it("can edit the second group of a two-group build", () => {
      const original = Gen.mustBuild(twoBits, [1, 1]);
      assertEquals(original.val, `(1, 1)`);

      const mut = MutableGen.from(original);
      assert(mut.tryEdits((i) => i === 1 ? snip : keep));
      assertEquals(propsFromGen(mut.gen), {
        name: "twoBits",
        val: `(1, 0)`,
        reqs: [PickRequest.bit, PickRequest.bit],
        replies: [1, 0],
      });
    });

    const evenRoll = Script.make("evenRoll", (pick) => {
      const roll = pick(new PickRequest(1, 6));
      if (roll % 2 !== 0) {
        throw new Filtered("that's odd");
      }
      return roll;
    });

    const evenDoubles = Script.make("evenDoubles", (pick) => {
      const a = pick(evenRoll);
      const b = pick(new PickRequest(1, 6));
      if (a !== b) {
        throw new Filtered("not a double");
      }
      return [a, b];
    });

    it("fails if editing the first group fails", () => {
      const original = Gen.mustBuild(evenDoubles, [2, 2]);
      const mut = MutableGen.from(original);
      assertFalse(
        mut.tryEdits((i) => (i === 0) ? () => replace(0) : keep),
      );
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

  describe("for a script with logCalls turned on", () => {
    it("generates all values", () => {
      const playouts = orderedPlayouts();
      for (const expectedReplies of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const gen = generate(twoBits, playouts);
        assertEquals(propsFromGen(gen), {
          name: "twoBits",
          val: `(${expectedReplies[0]}, ${expectedReplies[1]})`,
          reqs: [bitReq, bitReq],
          replies: expectedReplies,
        });
        assert(gen !== filtered);
        assertEquals(MutableGen.from(gen).groupKeys, [0, 1]);
      }
      assertEquals(generate(twoBits, playouts), filtered);
    });

    it("retries when the first group is filtered", () => {
      const filterZero = Script.make("filterZero", (pick) => {
        const a = pick(bit, { accept: (v) => v !== 0 });
        const b = pick(bit);
        return [a, b];
      }, { logCalls: true });

      const gen = generate(filterZero, orderedPlayouts());

      assertEquals(propsFromGen(gen), {
        val: [1, 0],
        name: "filterZero",
        reqs: [bitReq, bitReq],
        replies: [1, 0],
      });
      assert(gen !== filtered);
      assertEquals(MutableGen.from(gen).groupKeys, [0, 1]);
    });

    it("regenerates a result that can't be cached", () => {
      const cached = Script.make("uncached", (pick) => {
        const val = pick(frozen);
        return val.concat(["" + pick(PickRequest.bit)]);
      }, { logCalls: true });

      const gen = generate(cached, minPlayout());

      assertEquals(propsFromGen(gen), {
        name: "uncached",
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
      const script = Script.make("throws", (pick) => {
        pick(bit);
        throw new Error("oops");
      }, { logCalls: true });

      const picks = onePlayout(new PlaybackPicker([]));
      assertThrows(
        () => generate(script, picks),
        Error,
        "oops",
      );
    });

    it("fails when all playouts were rejected", () => {
      const script = Script.make("untitled", (pick) => {
        pick(bit, { accept: () => false });
      }, { logCalls: true });

      const gen = generate(
        script,
        onePlayout(new PlaybackPicker([])),
      );
      assertEquals(gen, filtered);
    });
  });
});
