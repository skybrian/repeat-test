import { alwaysPickMin, PickRequest } from "./picks.ts";
import { PlayoutSource } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";
import { generate } from "./generated.ts";
import type { Generated, PickSet } from "./generated.ts";

/**
 * Generates possible playouts with shorter playouts before longer ones.
 *
 * (Here, "shorter" means the playout with trailing minimum picks removed.)
 */
export class MultipassSearch extends PlayoutSource {
  /** Keeps track of which playouts have been pruned, including previous passes. */
  #shared = new PickTree().walk();

  /** Keeps track of playouts that were pruned during the current pass. */
  #pass = new PickTree().walk();

  #currentPass = 0;
  #filteredThisPass = false;

  constructor(readonly maxPasses?: number) {
    super();
  }

  get currentPass() {
    return this.#currentPass;
  }

  protected startPlayout(depth: number): void {
    this.#shared.trim(depth);
    this.#pass.trim(depth);
  }

  protected maybePick(req: PickRequest): number | undefined {
    let replaced = req;
    if (this.depth >= this.#currentPass) {
      replaced = new PickRequest(req.min, req.min);
      this.#filteredThisPass = true;
    }

    const firstChoice = alwaysPickMin.pick(replaced);
    const pick = this.#pass.pushUnpruned(firstChoice, replaced);
    if (!this.#shared.push(req, pick)) {
      return undefined; // pruned in previous pass
    }
    return pick;
  }

  getReplies(): number[] {
    return this.#pass.getPicks();
  }

  protected acceptPlayout(): boolean {
    return !this.#shared.pruned;
  }

  protected nextPlayout(): number | undefined {
    this.#shared.prune();
    this.#pass.prune();
    if (!this.#pass.pruned) {
      // continue current pass
      return this.#pass.depth;
    }

    // Start next pass
    this.#pass = new PickTree().walk();
    this.#currentPass++;
    if (!this.#filteredThisPass || this.#currentPass === this.maxPasses) {
      // no more passes needed
      return undefined;
    }
    this.#filteredThisPass = false;
    return 0;
  }
}

/**
 * Iterates over all values that can be generated by a PickSet.
 *
 * This might be an infinite stream if the PickSet represents an infinite set.
 * The values start with a minimum playout and gradually get larger, as
 * generated by playouts of increasing size.
 */
export function* generateAll<T>(
  set: PickSet<T>,
): IterableIterator<Generated<T>> {
  const search = new MultipassSearch();
  let gen = generate(set, search);
  while (gen) {
    yield gen;
    gen = generate(set, search);
  }
}

/**
 * Returns the first generated value that satisfies the given predicate, if it's
 * within the given limit.
 *
 * It returns undefined if every possible value was tried.
 */
export function find<T>(
  set: PickSet<T>,
  predicate: (val: T) => boolean,
  opts?: { limit: number },
): Generated<T> | undefined {
  const limit = opts?.limit ?? 1000;

  let count = 0;
  for (const gen of generateAll(set)) {
    if (predicate(gen.val)) {
      return gen;
    }
    if (++count >= limit) {
      throw new Error(
        `findBreadthFirst for '${set.label}': no match found in the first ${limit} values`,
      );
    }
  }
  return undefined;
}

export function takeGenerated<T>(set: PickSet<T>, n: number): Generated<T>[] {
  const result = [];
  for (const gen of generateAll(set)) {
    result.push(gen);
    if (result.length >= n) {
      break;
    }
  }
  return result;
}

/**
 * Returns up to n examples from this Arbitrary, in the same order as
 * {@link generateAll}.
 *
 * There may be duplicates.
 */
export function take<T>(set: PickSet<T>, n: number): T[] {
  return takeGenerated(set, n).map((gen) => gen.val);
}

/**
 * Generates all examples from this Arbitrary, provided that it's not too many.
 *
 * @param opts.limit The maximum size of the array to return.
 *
 * There may be duplicates.
 */
export function takeAll<T>(
  set: PickSet<T>,
  opts?: { limit?: number },
): T[] {
  const limit = opts?.limit ?? 1000;

  const examples = take(set, limit + 1);
  if ((examples.length > limit)) {
    throw new Error(
      `takeAllBreadthFirst for '${set.label}': array would have more than ${limit} elements`,
    );
  }
  return examples;
}
