import type { PickSet } from "../src/generated.ts";
import type { Gen } from "../src/gen_class.ts";

import { beforeEach, describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertThrows } from "@std/assert";

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

import {
  generate,
  generateValue,
  generateValueWithDeps,
  makePickFunction,
} from "../src/generated.ts";
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

const fails: PickSet<unknown> = {
  label: "fails",
  generateFrom: () => {
    throw new Error("oops!");
  },
};

type GenProps<T> = {
  val: T;
  deps?: GenProps<unknown>;
  label: string;
  reqs: PickRequest[];
  replies: number[];
};

function props<T>(
  gen: Gen<T> | undefined,
): GenProps<T> | undefined {
  if (gen === undefined) {
    return undefined;
  }
  const picks = gen.allPicks;
  const out: GenProps<T> = {
    val: gen.val,
    label: gen.label,
    reqs: picks.reqs,
    replies: picks.replies,
  };
  if (gen.deps !== undefined) {
    out.deps = props(gen.deps);
  }
  return out;
}

describe("generate", () => {
  const hello: PickSet<string> = {
    label: "hello",
    generateFrom: () => "hi",
  };

  it("generates a single value for a constant", () => {
    const gen = generate(hello, minPlayout());
    assertEquals(props(gen), {
      val: "hi",
      label: "hello",
      reqs: [],
      replies: [],
    });
  });

  it("passes through an error thrown by the PickSet", () => {
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
  const bitReq = new PickRequest(0, 1);

  const bit: PickSet<number> = {
    label: "bit",
    generateFrom: (pick) => pick(bitReq),
  };

  it("can generate two bits in different playouts", () => {
    const playouts = depthFirstPlayouts();

    const gen1 = generateValue(bit, playouts);
    assertEquals(props(gen1), {
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
    assertEquals(props(gen2), {
      val: 1,
      label: "bit",
      reqs: [bitReq],
      replies: [1],
    });
  });

  it("can generate two bits in the same playout", () => {
    const playouts = onePlayout(new PlaybackPicker([0, 1]));

    const gen1 = generateValue(bit, playouts);
    assertEquals(props(gen1), {
      val: 0,
      label: "bit",
      reqs: [bitReq],
      replies: [0],
    });
    assertEquals(playouts.depth, 1);

    const gen2 = generateValue(bit, playouts);
    assertEquals(playouts.depth, 2);
    assertEquals(props(gen2), {
      val: 1,
      label: "bit",
      reqs: [bitReq],
      replies: [1],
    });
  });

  const filteredOne: PickSet<number> = {
    label: "filteredOne",
    generateFrom: (pick) => {
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
    assertEquals(props(gen1), {
      val: 1,
      label: "filteredOne",
      reqs: [bitReq],
      replies: [1],
    });
    assertEquals(playouts.depth, 1);

    const gen2 = generateValue(filteredOne, playouts);
    assertEquals(playouts.depth, 2);
    assertEquals(props(gen2), {
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
    generateFrom: () => {
      throw new Pruned("nope");
    },
  };

  it("returns undefined if there are no matching playouts", () => {
    const playouts = depthFirstPlayouts();
    assertEquals(generateValue(rejectAll, playouts), undefined);
  });
});

describe("generateValueWithDeps", () => {
  const bit = new PickRequest(0, 1);

  const depsReq: PickSet<number> = {
    label: "deps",
    generateFrom: (pick) => pick(bit),
  };

  const hasDep: PickSet<string> = {
    label: "hasDep",
    generateFrom: (pick) => {
      const deps = pick(depsReq);
      const bit2 = pick(bit);
      return `${deps}, ${bit2}`;
    },
  };

  it("saves the first pick as the deps", () => {
    const gen = generateValueWithDeps(hasDep, depthFirstPlayouts());
    assertEquals(props(gen), {
      val: "0, 0",
      label: "hasDep",
      reqs: [bit, bit],
      replies: [0, 0],
      deps: {
        val: 0,
        label: "deps",
        reqs: [bit],
        replies: [0],
      },
    });
  });
});
