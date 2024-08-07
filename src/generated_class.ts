import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { GenerateOpts, makePickFunction, PickSet } from "./pick_function.ts";
import { PickList } from "./picks.ts";

/**
 * Holds a generated value along with the picks that were used to generate it.
 */
export class Generated<T> {
  #picks: PickList;
  #val: T;

  constructor(
    picks: PickList,
    val: T,
  ) {
    this.#picks = picks;
    this.#val = val;
  }

  readonly ok = true;

  get val() {
    return this.#val;
  }

  picks() {
    return this.#picks.slice();
  }

  replies() {
    return this.#picks.replies();
  }
}

/**
 * Generates a value by trying each playout one at a time, given a source of
 * playouts.
 *
 * Returns undefined if it ran out of playouts without generating anything.
 */
export function generate<T>(
  set: PickSet<T>,
  picker: PlayoutPicker,
  opts?: GenerateOpts,
): Generated<T> | undefined {
  while (picker.startAt(0)) {
    try {
      const pick = makePickFunction(picker, opts);
      const val = set.generateFrom(pick);
      const picks = picker.getPicks();
      if (picker.endPlayout()) {
        return new Generated(picks, val);
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  }
}
