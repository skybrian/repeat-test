import prand from "pure-rand";
import type { IntPicker, PickRequest, UniformRandomSource } from "./picks.ts";
import { assert, fail } from "@std/assert";

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
    fail("not implemented");
  }
  next(): [number, prand.RandomGenerator] {
    fail("not implemented");
  }
  jump?(): prand.RandomGenerator {
    fail("not implemented");
  }
  unsafeJump?(): void {
    fail("not implemented");
  }
  getState?(): readonly number[] {
    fail("not implemented");
  }
}

function uniformPick(next: Int32Source, size: number) {
  const limit = ~~((0x100000000) / size) * size;
  let val = next() + 0x80000000;
  while (val >= limit) {
    val = next() + 0x80000000;
  }
  return (val % size);
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
    if (size < 0x100000000) {
      return uniformPick(next, size) + min;
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
