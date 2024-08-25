import prand from "pure-rand";
import type { IntPicker, PickRequest, UniformRandomSource } from "./picks.ts";
import { assert } from "@std/assert";

export function pickRandomSeed(): number {
  return Date.now() ^ (Math.random() * 0x100000000);
}

export function uniformSource(rng: prand.RandomGenerator): UniformRandomSource {
  return (min, max) => {
    const size = max - min + 1;
    switch (size) {
      case 1:
        return min;
      case 2:
        return (rng.unsafeNext() & 0x1) + min;
      case 128:
        return (rng.unsafeNext() & 0x7F) + min;
    }
    return prand.unsafeUniformIntDistribution(min, max, rng);
  };
}

/**
 * Creates a random picker that uses the RandomGenerator's current state as a
 * starting point.
 */
function makePicker(rng: prand.RandomGenerator): IntPicker {
  const uniform = uniformSource(rng.clone());

  return {
    pick(req: PickRequest) {
      return req.bias(uniform);
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
  assert(jump);
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
