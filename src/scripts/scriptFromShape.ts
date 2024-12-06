import type { Pickable, PickFunction } from "../pickable.ts";
import { Script } from "../script_class.ts";
import { scriptFrom } from "./scriptFrom.ts";

/**
 * Specifies how to generate each property of an object.
 *
 * The properties are independently generated, with no constraints between them.
 *
 * (Only string-keyed properties are supported.)
 */
export type ObjectShape<T extends Record<string, unknown>> = {
  [K in keyof T]: Pickable<T[K]>;
};

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
