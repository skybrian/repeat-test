import prand from "pure-rand";
import type { IntPicker, PickRequest, UniformRandomSource } from "./picks.ts";
import { assert } from "@std/assert";

export function pickRandomSeed(): number {
  return Date.now() ^ (Math.random() * 0x100000000);
}

type Int32Source = () => number;

class Adapter implements prand.RandomGenerator {
  constructor(private readonly rng: Int32Source) {}
  unsafeNext(): number {
    return this.rng();
  }
  clone(): prand.RandomGenerator {
    assert(false, "not implemented");
  }
  next(): [number, prand.RandomGenerator] {
    assert(false, "not implemented");
  }
  jump?(): prand.RandomGenerator {
    assert(false, "not implemented");
  }
  unsafeJump?(): void {
    assert(false, "not implemented");
  }
  getState?(): readonly number[] {
    assert(false, "not implemented");
  }
}

export function uniformSource(next: Int32Source): UniformRandomSource {
  return (min, max) => {
    const size = max - min + 1;
    switch (size) {
      case 1:
        return min;
      case 2:
        return (next() & 0x1) + min;
      case 128:
        return (next() & 0x7F) + min;
    }
    return prand.unsafeUniformIntDistribution(min, max, new Adapter(next));
  };
}

/**
 * Creates a random picker that uses the RandomGenerator's current state as a
 * starting point.
 */
function makePicker(rng: prand.RandomGenerator): IntPicker {
  rng = rng.clone();
  const next = rng.unsafeNext.bind(rng);
  const uniform = uniformSource(next);

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
