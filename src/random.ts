import prand from "pure-rand";
import type { IntPicker, PickRequest, UniformRandomSource } from "./picks.ts";
import { assert } from "@std/assert";

export function pickRandomSeed(): number {
  return Date.now() ^ (Math.random() * 0x100000000);
}

type Int32Source = () => number;

/**
 * Returns a random number such that 0 <= n <= max.
 * Where max < 2**32.
 */
function smallUniformPick(next: Int32Source, max: number) {
  switch (max) {
    case 0:
      return 0;
    case 1:
      return next() & 1;
    case 127:
      return (next() & 0x7F);
  }
  const size = max + 1;
  const quotient = ~~(0x100000000 / size);
  const limit = quotient * size;
  while (true) {
    const val = next() + 0x80000000;
    if (val < limit) {
      return val % size;
    }
  }
}

/**
 * Returns a random number such that 0 <= n <= max.
 * Where max >= 2**32 and max <= Math.MAX_SAFE_INTEGER.
 */
function largeUniformPick(next: Int32Source, max: number) {
  const hiMax = (max / 0x100000000) | 0;
  const loMax = max - hiMax * 0x100000000;
  while (true) {
    const hi = smallUniformPick(next, hiMax);
    const lo = next() + 0x80000000;
    if (hi < hiMax || lo <= loMax) {
      return hi * 0x100000000 + lo;
    }
  }
}

export function uniformSource(next: Int32Source): UniformRandomSource {
  return (min, max) => {
    const innerMax = max - min;
    if (innerMax < 0x100000000) {
      return smallUniformPick(next, innerMax) + min;
    }
    return largeUniformPick(next, innerMax) + min;
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
