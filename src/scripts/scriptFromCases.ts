import { assert } from "@std/assert/assert";
import type { Pickable } from "../pickable.ts";
import { IntRequest, type RandomPicker } from "../picks.ts";
import { Script } from "../script_class.ts";
import { scriptFrom } from "./scriptFrom.ts";

/**
 * Creates a script that randomly picks a pickable to call.
 */
export function scriptFromCases<T>(
  cases: Pickable<T>[],
  opts?: { caller: string },
): Script<T> {
  const caller = opts?.caller ?? "scriptFromCases";
  if (cases.length === 0) {
    throw new Error(`${caller}() requires at least one case`);
  }

  const scripts = cases.map((c) => scriptFrom(c));
  if (scripts.length === 1 && scripts[0].weight > 0) {
    return scripts[0];
  }

  let maxSize: number | undefined = 0;
  for (const s of scripts) {
    const caseSize = s.opts.maxSize;
    if (caseSize === undefined) {
      maxSize = undefined;
      break;
    }
    maxSize += caseSize;
  }

  const weights: number[] = [];
  let totalWeight = 0;
  let allDefaultWeights = true;
  for (const s of scripts) {
    const weight = s.opts.weight ?? 1;
    if (weight !== 1) {
      allDefaultWeights = false;
    }
    totalWeight += weight;
    weights.push(weight);
  }

  let bias: RandomPicker | undefined = undefined;
  if (!allDefaultWeights) {
    if (totalWeight === 0) {
      throw new Error(
        `${caller}() requires at least one case with weight > 0`,
      );
    }

    let newTotal = 0;
    for (let i = 0; i < weights.length; i++) {
      const next = weights[i] / totalWeight * 0x100000000;
      weights[i] = next;
      newTotal += next;
    }
    weights[weights.length - 1] += 0x100000000 - newTotal;

    bias = (next) => {
      const n = next(); // unsigned 32-bit integer
      let sum = -0x80000000;
      for (let i = 0; i < weights.length - 1; i++) {
        sum += weights[i];
        if (n < sum) {
          return i;
        }
      }
      return weights.length - 1;
    };
  }

  const req = new IntRequest(0, cases.length - 1, { bias });

  return Script.make("oneOf", (pick) => {
    const index = pick(req);
    assert(index >= 0 && index < cases.length, `invalid index: ${index}`);
    return scripts[index].directBuild(pick);
  }, { maxSize, lazyInit: true, cachable: true });
}
