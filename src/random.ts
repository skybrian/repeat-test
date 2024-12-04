import type { IntPicker, IntRequest } from "./picks.ts";

import { assert } from "@std/assert";
import prand from "pure-rand";
import { Backtracker } from "./backtracking.ts";
import { PartialTracker } from "./partial_tracker.ts";

export function pickRandomSeed(): number {
  return Date.now() ^ (Math.random() * 0x100000000);
}

/**
 * Creates a random picker that uses the RandomGenerator's current state as a
 * starting point.
 */
function makePicker(rng: prand.RandomGenerator): IntPicker {
  rng = rng.clone();
  const next = rng.unsafeNext.bind(rng);

  return {
    pick(req: IntRequest) {
      return req.random(next);
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

export function randomPlayouts(seed: number): Backtracker {
  return new Backtracker(new PartialTracker(randomPicker(seed)));
}
