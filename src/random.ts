import prand from "pure-rand";
import { IntPicker, PickRequest, UniformIntPicker } from "./picks.ts";

export function pickRandomSeed(): number {
  return Date.now() ^ (Math.random() * 0x100000000);
}

/**
 * Creates a random picker that uses the RandomGenerator's current state as a
 * starting point.
 */
function makePicker(rng: prand.RandomGenerator): IntPicker {
  // Clone so we can mutate it.
  rng = rng.clone();

  const uniform: UniformIntPicker = (min, max) =>
    prand.unsafeUniformIntDistribution(min, max, rng);

  const picks: number[] = [];

  return {
    get isRandom() {
      return true;
    },
    pick(req: PickRequest) {
      const pick = req.bias(uniform);
      picks.push(pick);
      return pick;
    },
  };
}

/**
 * Returns a single random number generator.
 */
export function randomPicker(seed: number): IntPicker {
  return makePicker(prand.xoroshiro128plus(seed));
}

function jump(r: prand.RandomGenerator): prand.RandomGenerator {
  const jump = r.jump;
  if (!jump) {
    throw new Error("no jump function");
  }
  return jump.bind(r)();
}

/**
 * Returns a sequence of random number generators where each is independent.
 */
export function* randomPickers(seed: number): IterableIterator<IntPicker> {
  let rng = prand.xoroshiro128plus(seed);
  while (true) {
    yield makePicker(rng);
    rng = jump(rng);
  }
}
