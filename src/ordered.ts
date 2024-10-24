import type { Pickable } from "./pickable.ts";
import type { Tracker } from "./backtracking.ts";
import type { Gen } from "./gen_class.ts";

import { assert } from "@std/assert";
import { filtered } from "./results.ts";
import { Filtered } from "./pickable.ts";
import { PickRequest } from "./picks.ts";
import { Backtracker } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";
import { makePickFunction } from "./build.ts";
import { Script } from "@/arbitrary.ts";
import { generate } from "./gen_class.ts";

/**
 * Generates possible playouts in the order used for choosing defaults.
 *
 * It uses iterative deepening to gradually increase the width and depth of the
 * search.
 */
export class OrderedTracker implements Tracker {
  /** Keeps track of which playouts have been pruned, including previous passes. */
  #shared = new PickTree().walk();

  /** Keeps track of playouts that were pruned during the current pass. */
  #pass = new PickTree().walk();

  #currentPass = 0;
  #filteredThisPass = false;

  constructor(readonly maxPasses?: number) {}

  get currentPass() {
    return this.#currentPass;
  }

  startPlayout(depth: number): void {
    this.#shared.trim(depth);
    this.#pass.trim(depth);
  }

  maybePick(req: PickRequest): number | undefined {
    let replaced = req;

    let maxSize = this.#currentPass - this.#pass.depth + 1;
    if (this.#currentPass > 10) {
      // Widen more rapidly to handle scanning over a very wide PickRequest like
      // char16 without an excessive number of passes. (Which pass to start at
      // doesn't seem to effect performance that much.)
      maxSize *= this.#currentPass - 10;
    }
    if (maxSize < 1 || this.#pass.depth >= this.#currentPass) maxSize = 1;

    if (maxSize < req.size) {
      replaced = new PickRequest(req.min, req.min + maxSize - 1);
      this.#filteredThisPass = true;
    }

    const lowest = this.#shared.firstUnprunedInRange(req.min, req.max);
    if (lowest === undefined) {
      return undefined; // pruned in previous pass
    }
    // No need to revisit branches already pruned in a previous pass.
    this.#pass.pruneBranchTo(lowest);

    const pick = this.#pass.pushUnpruned(req.min, replaced);
    assert(this.#shared.push(req, pick));

    if (this.#shared.pruned) {
      // Skipped to a pruned pick.
      return undefined;
    }

    return pick;
  }

  nextPlayout(): number | undefined {
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
 * A stream of playouts in a deterministic order.
 *
 * (This order determines how default values are generated.)
 */
export function orderedPlayouts(): Backtracker {
  return new Backtracker(new OrderedTracker());
}

/**
 * Generates a default value for a PickSet, along with the picks used to
 * generate it.
 *
 * Usually it's a zero or minimum value. Shrinking will return this value when
 * possible.
 */
export function generateDefault<T>(arg: Pickable<T>): Gen<T> {
  const script = Script.from(arg);
  const gen = generate(script, orderedPlayouts());
  assert(gen !== filtered, `${script.name} has no default`);
  return gen;
}

/**
 * Iterates over all values that can be generated by a PickSet.
 *
 * This might be an infinite stream if the PickSet represents an infinite set.
 * The values start with a minimum playout and gradually get larger, as
 * generated by playouts of increasing size.
 */
export function* generateAll<T>(
  arg: Pickable<T>,
): IterableIterator<Gen<T>> {
  const candidates = orderedPlayouts();
  let gen = generate(arg, candidates);
  while (gen !== filtered) {
    yield gen;
    gen = generate(arg, candidates);
  }
}

/**
 * Returns the first generated value that satisfies the given predicate, if it's
 * within the given limit.
 *
 * It returns undefined if every possible value was tried.
 */
export function find<T>(
  arg: Pickable<T>,
  predicate: (val: T) => boolean,
  opts?: { limit: number },
): Gen<T> | undefined {
  const script = Script.from(arg);
  const limit = opts?.limit ?? 1000;

  let count = 0;
  for (const gen of generateAll(arg)) {
    if (predicate(gen.val)) {
      return gen;
    }
    if (++count >= limit) {
      throw new Error(
        `find for '${script.name}': no match found in the first ${limit} values`,
      );
    }
  }
  return undefined;
}

export function takeGenerated<T>(arg: Pickable<T>, n: number): Gen<T>[] {
  const result = [];
  for (const gen of generateAll(arg)) {
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
export function take<T>(arg: Pickable<T>, n: number): T[] {
  const result = [];
  const playouts = orderedPlayouts();
  const pick = makePickFunction(playouts);
  while (playouts.startAt(0) && result.length < n) {
    try {
      result.push(arg.directBuild(pick));
    } catch (e) {
      if (!(e instanceof Filtered)) {
        throw e;
      }
    }
  }
  return result;
}

/**
 * Generates all examples from this Arbitrary, provided that it's not too many.
 *
 * @param opts.limit The maximum size of the array to return.
 *
 * There may be duplicates.
 */
export function takeAll<T>(
  arg: Pickable<T>,
  opts?: { limit?: number },
): T[] {
  const script = Script.from(arg);
  const limit = opts?.limit ?? 1000;

  const examples = take(script, limit + 1);
  if ((examples.length > limit)) {
    throw new Error(
      `takeAll for '${script.name}': array would have more than ${limit} elements`,
    );
  }
  return examples;
}
