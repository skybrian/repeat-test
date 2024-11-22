import type { Pickable, PickFunction } from "../pickable.ts";
import type { HasScript } from "../script_class.ts";

import { PickRequest } from "../picks.ts";
import { Script } from "../script_class.ts";

/**
 * Converts any Pickable into a Script.
 *
 * If it wasn't already a Script and didn't implement HasScript, it will be
 * named 'untitled'.
 */
export function scriptFrom<T>(
  arg: Pickable<T>,
  opts?: { caller: string },
): Script<T> {
  if (arg instanceof Script) {
    return arg;
  } else if (arg instanceof PickRequest) {
    const name = `${arg.min}..${arg.max}`;
    const maxSize = arg.max - arg.min + 1;

    return Script.make(name, (pick: PickFunction) => {
      return pick(arg) as T;
    }, { cachable: true, logCalls: true, maxSize, lazyInit: true });
  }

  if (
    arg === null || typeof arg !== "object" ||
    typeof arg.directBuild !== "function"
  ) {
    const caller = opts?.caller ?? "Script.from()";
    throw new Error(`${caller} called with an invalid argument`);
  }

  const props: Partial<HasScript<T>> = arg;
  if (
    props.buildScript !== undefined && props.buildScript instanceof Script
  ) {
    return props.buildScript;
  } else {
    return Script.make("untitled", (pick) => arg.directBuild(pick));
  }
}
