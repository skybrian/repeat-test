import prand from "pure-rand";
import { IntPicker, PickRequest, UniformIntPicker } from "./picks.ts";

function jump(r: prand.RandomGenerator): prand.RandomGenerator {
  const jump = r.jump;
  if (!jump) {
    throw new Error("no jump function");
  }
  return jump.bind(r)();
}

/**
 * Returns a sequence of random number generators to use.
 */
export function* randomPickers(seed: number): IterableIterator<IntPicker> {
  let rng = prand.xoroshiro128plus(seed);
  while (true) {
    const next = jump(rng);
    yield makePicker(rng);
    rng = next;
  }
}

function makePicker(rng: prand.RandomGenerator): IntPicker {
  const uniform: UniformIntPicker = (min, max) =>
    prand.unsafeUniformIntDistribution(min, max, rng);

  return {
    pick(req: PickRequest) {
      return req.bias(uniform);
    },
  };
}
