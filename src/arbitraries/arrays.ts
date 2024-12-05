import type { Pickable, PickFunction } from "../entrypoints/core.ts";
import type { ArrayOpts } from "../options.ts";

import { Arbitrary } from "../entrypoints/core.ts";
import { parseArrayOpts } from "../options.ts";
import { arrayLengthBiases } from "../math.ts";
import { Script } from "../script_class.ts";
import { scriptFrom } from "../scripts/scriptFrom.ts";
import { biased } from "./basics.ts";

export const off = Symbol("off");

function option<T>(bias: number, item: Pickable<T>): Script<T | typeof off> {
  const coin = biased(bias);
  const it = scriptFrom(item);
  return Script.make("option", (pick) => {
    if (pick(coin)) {
      return pick(it);
    } else {
      return off;
    }
  }, { cachable: it.opts.cachable });
}

export type ItemFunction<T> = (i: number, pick: PickFunction) => T | typeof off;

export function makeItemFunction<T>(
  item: Pickable<T>,
  min: number,
  max: number,
): ItemFunction<T> {
  // Arrays are represented as a fixed-length part followed by a variable-length
  // part. The fixed-length part only contains picks for items themselves. In
  // the variable-length-part, each item is preceded by a 1, followed by a 0 to
  // terminate.
  //
  // Since we make a pick request for each item, this makes longer arrays less
  // likely but possible, and it should be easier remove items when shrinking.

  // The variable-length-part is further subdivided into a start region and an
  // extended region.

  const startRegionSize = 100;
  const [startBias, extendedBias] = arrayLengthBiases(max - min, {
    startRegionSize,
  });

  const startOption = option(startBias, item);
  const extendedOption = option(extendedBias, item);

  function nextItem(i: number, pick: PickFunction): T | typeof off {
    if (i >= max) {
      return off; // done
    }
    if (i < min) {
      return pick(item); // fixed-length portion
    }
    if (i < min + startRegionSize) {
      return pick(startOption);
    } else {
      return pick(extendedOption);
    }
  }

  return nextItem;
}

/**
 * Defines an Arbitrary that generates arrays of the given item.
 *
 * By default, generates arrays with a length of up to 1000. This can
 * be overriden with the {@link ArrayOpts.length} option.
 */
export function array<T>(
  item: Pickable<T>,
  opts?: ArrayOpts,
): Arbitrary<T[]> {
  const { min, max } = parseArrayOpts(opts);

  const nextItem = makeItemFunction(item, min, max);

  const script = Script.make("array", function pickArray(pick: PickFunction) {
    const result = [];
    let i = 0;
    while (true) {
      const item = nextItem(i, pick);
      if (item === off) {
        break;
      }
      result.push(item);
      i++;
    }
    return result;
  }, { lazyInit: true, logCalls: true });

  return Arbitrary.from(script);
}
