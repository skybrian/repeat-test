import type { ObjectShape, PickFunction } from "../pickable.ts";
import { Script } from "../script_class.ts";
import { scriptFrom } from "./scriptFrom.ts";

/**
 * Makes a new script the generates an object with the given shape.
 */
export function scriptFromShape<T extends Record<string, unknown>>(
  name: string,
  shape: ObjectShape<T>,
): Script<T> {
  const keys: string[] = Object.keys(shape);

  const props = Object.fromEntries(
    keys.map((key) => [key, scriptFrom(shape[key])]),
  );

  let maxSize: number | undefined = 1;
  for (const key of keys) {
    const size = props[key].opts.maxSize;
    if (size === undefined) {
      maxSize = undefined;
      break;
    }
    maxSize *= size;
  }

  return Script.make(
    name,
    (pick: PickFunction) => {
      const result = Object.fromEntries(
        keys.map((key) => [key, pick(props[key])]),
      );
      return result as T;
    },
    { maxSize, lazyInit: true, logCalls: keys.length > 1 },
  );
}
