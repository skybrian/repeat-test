import { PickRequest } from "../picks.ts";
import { Script } from "../script_class.ts";

/**
 * Creates a Script that picks from a list of examples.
 */
export function scriptOf<T>(
  examples: T[],
  opts?: { caller: string },
): Script<T> {
  const caller = opts?.caller ?? "itemFrom()";

  if (examples.length === 0) {
    throw new Error(`${caller} requires at least one item`);
  }

  for (const example of examples) {
    if (!Object.isFrozen(example)) {
      throw new Error(`${caller} requires frozen objects`);
    }
  }

  if (examples.length === 1) {
    const val = examples[0];

    let name = "a constant";
    if (val === undefined || val === null || typeof val === "number") {
      name = `${val} (constant)`;
    } else if (typeof val === "string") {
      name = `"${val}" (constant)`;
    }

    return Script.make(name, () => val, { maxSize: 1, lazyInit: true });
  }

  const req = new PickRequest(0, examples.length - 1);
  const maxSize = examples.length;

  return Script.make(`${examples.length} examples`, (pick) => {
    const i = pick(req);
    return examples[i];
  }, { maxSize, lazyInit: true });
}
