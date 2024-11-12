import type { Pickable } from "../pickable.ts";

import { generate } from "../gen_class.ts";
import { generateDefault } from "../ordered.ts";
import { randomPlayouts } from "../random.ts";
import { filtered } from "../results.ts";
import { Script, scriptFrom } from "../script_class.ts";

/** Creates a new Script that has some of its values filtered out. */
export function filter<T>(
  input: Pickable<T>,
  accept: (val: T) => boolean,
): Script<T> {
  // Check that accept() returns often enough.
  // Based on biased coin simulation:
  // https://claude.site/artifacts/624afebe-b86f-4e33-9e30-5414dc7c810b

  const script = scriptFrom(input);

  let threshold = 2;
  const playouts = randomPlayouts(123);
  let accepted = 0;
  let total = 0;
  const maxTries = 50;
  while (total < maxTries) {
    const gen = generate(input, playouts, { limit: 1000 });
    if (gen === filtered) {
      break; // visited all values
    }
    total++;
    if (accept(gen.val)) {
      accepted++;
      if (accepted >= threshold) {
        break;
      }
    }
  }

  if (total < maxTries) {
    threshold = 1; // small arbitraries only need to pass one value through
  }
  if (accepted < threshold) {
    throw new Error(
      `filter on '${script.name}' didn't allow enough values through; want: ${threshold} of ${total}, got: ${accepted}`,
    );
  }

  const name = script.name.endsWith("(filtered)")
    ? script.name
    : `${script.name} (filtered)`;

  const out = Script.make(name, (pick) => {
    return pick(input, { accept });
  }, { ...script.opts, cachable: true });

  // Check that a default exists
  generateDefault(out);

  return out;
}
