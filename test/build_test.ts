import type { PickSet } from "../src/build.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { repeatTest } from "@/runner.ts";
import { Arbitrary } from "@/arbitrary.ts";

import { alwaysPick, PickRequest } from "../src/picks.ts";
import {
  minPlayout,
  onePlayout,
  PlayoutSource,
  Pruned,
} from "../src/backtracking.ts";
import { depthFirstPlayouts, PartialTracker } from "../src/partial_tracker.ts";
import { randomPicker, randomPlayouts } from "../src/random.ts";

import { propsFromGen } from "./lib/props.ts";
import {
  buildStep,
  generate,
  generateFromBuildStep,
  generateValue,
  makePickFunction,
} from "../src/build.ts";
import { arb } from "@/mod.ts";
import { PlaybackPicker } from "../src/picks.ts";

describe("makePickFunction", () => {
  const hi = Arbitrary.of("hi", "there");
  const bit = new PickRequest(0, 1);
  let pick = makePickFunction(minPlayout());

  beforeEach(() => {
    const playouts = randomPlayouts(123);
    playouts.startAt(0);
    pick = makePickFunction(playouts);
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

  it("gives up eventually", () => {
    const accept = () => false;
    assertThrows(
      () => pick(arb.string(), { accept }),
      Error,
      "accept() returned false 1000 times for string; giving up",
    );
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

    const tracker = new PartialTracker(alwaysPick(3));
    const playouts = new PlayoutSource(tracker);
    playouts.startAt(0);
    pick = makePickFunction(playouts);

    assertEquals(pick(arb), 4);
  });
});

const bit: PickSet<number> = {
  label: "bit",
  buildScript: (pick) => pick(PickRequest.bit),
};

const frozen: PickSet<readonly string[]> = {
  label: "frozen",
  buildScript: () => Object.freeze(["frozen"]),
};

const multiStep: PickSet<string> = {
  label: "multi-step",
  buildScript: {
    input: bit,
    then: (a, pick) => {
      const b = pick(bit);
      return `(${a}, ${b})`;
    },
  },
};

const fails: PickSet<unknown> = {
  label: "fails",
  buildScript: () => {
    throw new Error("oops!");
  },
};

describe("generate", () => {
  const hello: PickSet<string> = {
    label: "hello",
    buildScript: () => "hi",
  };

  it("generates a single value for a constant", () => {
    const gen = generate(hello, minPlayout());
    assertEquals(propsFromGen(gen), {
      val: "hi",
      label: "hello",
      reqs: [],
      replies: [],
    });
  });

  it("passes through an error thrown by the build function", () => {
    assertThrows(() => generate(fails, minPlayout()), Error, "oops");
  });

  const biased = new PickRequest(0, 1, {
    bias: () => 1,
  });
  const deep = Arbitrary.from((pick) => {
    let picks = 0;
    while (pick(biased) === 1) {
      picks++;
    }
    return picks;
  });

  it("can limit generation to the provided number of picks", () => {
    const limit = Arbitrary.from(new PickRequest(0, 10000));
    repeatTest(limit, (limit) => {
      const gen = generate(deep, onePlayout(randomPicker(123)), { limit });
      assert(gen !== undefined);
      assertEquals(gen.val, limit);
    }, { reps: 100 });
  });
});

describe("generateValue", () => {
  const bitReq = PickRequest.bit;

  it("can run a multi-step build script", () => {
    const gen = generateValue(multiStep, minPlayout());
    assertEquals(propsFromGen(gen), {
      val: "(0, 0)",
      label: "multi-step",
      reqs: [bitReq, bitReq],
      replies: [0, 0],
    });
  });

  it("can generate two bits in different playouts", () => {
    const playouts = depthFirstPlayouts();

    const gen1 = generateValue(bit, playouts);
    assertEquals(propsFromGen(gen1), {
      val: 0,
      label: "bit",
      reqs: [bitReq],
      replies: [0],
    });
    assertEquals(playouts.depth, 1);

    playouts.endPlayout();
    assertEquals(playouts.state, "playoutDone");
    assertEquals(0, playouts.depth);

    const gen2 = generateValue(bit, playouts);
    assertEquals(propsFromGen(gen2), {
      val: 1,
      label: "bit",
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("can generate two bits in the same playout", () => {
    const playouts = onePlayout(new PlaybackPicker([0, 1]));

    const gen1 = generateValue(bit, playouts);
    assertEquals(propsFromGen(gen1), {
      val: 0,
      label: "bit",
      reqs: [bitReq],
      replies: [0],
    });
    assertEquals(playouts.depth, 1);

    const gen2 = generateValue(bit, playouts);
    assertEquals(playouts.depth, 2);
    assertEquals(propsFromGen(gen2), {
      val: 1,
      label: "bit",
      reqs: [bitReq],
      replies: [1],
    });
  });

  const filteredOne: PickSet<number> = {
    label: "filteredOne",
    buildScript: (pick) => {
      const n = pick(bitReq);
      if (n !== 1) {
        throw new Pruned("try again");
      }
      return n;
    },
  };

  it("can generate two bits in restarted playouts", () => {
    const playouts = depthFirstPlayouts();

    const gen1 = generateValue(filteredOne, playouts);
    assertEquals(propsFromGen(gen1), {
      val: 1,
      label: "filteredOne",
      reqs: [bitReq],
      replies: [1],
    });
    assertEquals(playouts.depth, 1);

    const gen2 = generateValue(filteredOne, playouts);
    assertEquals(playouts.depth, 2);
    assertEquals(propsFromGen(gen2), {
      val: 1,
      label: "filteredOne",
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("passes through an error thrown by the PickSet", () => {
    assertThrows(
      () => generateValue(fails, depthFirstPlayouts()),
      Error,
      "oops",
    );
  });

  const rejectAll: PickSet<unknown> = {
    label: "rejectAll",
    buildScript: () => {
      throw new Pruned("nope");
    },
  };

  it("returns undefined if there are no matching playouts", () => {
    const playouts = depthFirstPlayouts();
    assertEquals(generateValue(rejectAll, playouts), undefined);
  });
});

describe("generateBuildStep", () => {
  it("generates a value when called", () => {
    const script = buildStep(bit, (val, pick) => `${val}, ${pick(bit)}`);

    const gen = generateFromBuildStep(
      "untitled",
      script,
      minPlayout(),
    );

    assertEquals(propsFromGen(gen), {
      label: "untitled",
      reqs: [PickRequest.bit, PickRequest.bit],
      replies: [0, 0],
      val: `0, 0`,
    });
  });

  it("regenerates the same value the second time", () => {
    const script = buildStep(
      frozen,
      (val, pick) => val.concat(["" + pick(PickRequest.bit)]),
    );

    const gen = generateFromBuildStep(
      "untitled",
      script,
      minPlayout(),
    );

    assertEquals(propsFromGen(gen), {
      label: "untitled",
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
    const script = buildStep(bit, () => {
      throw new Error("oops");
    });

    const picks = onePlayout(new PlaybackPicker([]));
    assertThrows(
      () => generateFromBuildStep("untitled", script, picks),
      Error,
      "oops",
    );
  });

  it("fails when all playouts were rejected", () => {
    const script = buildStep(bit, () => {
      throw new Pruned("nope");
    });

    const gen = generateFromBuildStep(
      "untitled",
      script,
      onePlayout(new PlaybackPicker([])),
    );
    assert(gen === undefined);
  });
});
