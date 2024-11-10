import type { Pickable } from "../pickable.ts";
import { PickRequest } from "../picks.ts";
import { Script } from "../script_class.ts";

/**
 * Creates a script that randomly picks a pickable to call.
 */
export function oneOf<T>(cases: Pickable<T>[]): Script<T> {
  if (cases.length === 0) {
    throw new Error("oneOf() requires at least one alternative");
  }

  const scripts = cases.map((c) => Script.from(c));
  if (scripts.length === 1) {
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

  const req = new PickRequest(0, cases.length - 1);

  return Script.make("oneOf", (pick) => {
    const index = pick(req);
    return scripts[index].directBuild(pick);
  }, { maxSize, lazyInit: true, cachable: true });
}
