import { alwaysPickMin, PickRequest } from "./picks.ts";
import { PlayoutSource } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";
import { PickSet } from "./pick_function.ts";
import { generate, Generated } from "./generated_class.ts";

type RequestFilter = (
  depth: number,
  req: PickRequest,
) => PickRequest | undefined;

type PlayoutFilter = (depth: number) => boolean;

type SearchOpts = {
  /**
   * Replaces each incoming pick request with a new one. The new request might
   * have a narrower range. If the callback returns undefined, the playout will
   * be cancelled.
   */
  replaceRequest: RequestFilter;
  acceptPlayout: PlayoutFilter;
};

/**
 * A filtered search over all possible playouts.
 */
class FilteredSearch {
  readonly tree: PickTree = new PickTree();
  readonly walk = this.tree.walk();
  readonly replaceRequest: RequestFilter;
  readonly acceptPlayout: PlayoutFilter;

  constructor(opts: SearchOpts) {
    this.replaceRequest = opts.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout;
  }
}

/**
 * Configures a FilteredSearch to run a breadth-first pass.
 * @param passIdx the number of previous passes that were run.
 * @param more called if more passes are needed.
 */
export function configurePass(
  passIdx: number,
  more: () => void,
): FilteredSearch {
  let moreSent = false;
  function pruned() {
    if (!moreSent) {
      more();
      moreSent = true;
    }
  }
  const replaceRequest = (depth: number, req: PickRequest) => {
    if (depth === passIdx - 1) {
      pruned();
      if (req.min === req.max) {
        return undefined; //  no more playouts
      }
      return new PickRequest(req.min + 1, req.max);
    } else if (depth >= passIdx) {
      pruned();
      return new PickRequest(req.min, req.min);
    }
    return req;
  };

  const acceptPlayout = (depth: number) => {
    if (depth === 0) {
      return passIdx === 0;
    }
    return depth >= passIdx;
  };
  return new FilteredSearch({ replaceRequest, acceptPlayout });
}

export class BreadthFirstSearch extends PlayoutSource {
  filtered: FilteredSearch;
  passIdx = 0;
  private pruned = false;

  constructor() {
    super();
    this.filtered = configurePass(this.passIdx, () => {
      this.pruned = true;
    });
  }

  protected startPlayout(depth: number): void {
    this.filtered.walk.trim(depth);
  }

  protected doPick(req: PickRequest): number | undefined {
    const replaced = this.filtered.replaceRequest(this.depth, req);
    if (replaced === undefined) {
      return undefined;
    }

    const firstChoice = alwaysPickMin.pick(replaced);
    const pick = this.filtered.walk.pushUnpruned(firstChoice, replaced);
    return pick;
  }

  getReplies(start?: number, end?: number): number[] {
    return this.filtered.walk.getPicks(start, end);
  }

  protected acceptPlayout(): boolean {
    return this.filtered.acceptPlayout(this.depth);
  }

  protected nextPlayout(): number | undefined {
    this.filtered.walk.prune();
    if (!this.filtered.walk.pruned) {
      // continue current pass
      return this.filtered.walk.depth;
    }

    if (!this.pruned) {
      // no more passes needed
      return undefined;
    }

    // Start next pass
    this.pruned = false;
    this.passIdx++;
    this.filtered = configurePass(this.passIdx, () => {
      this.pruned = true;
    });
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
  const source = new BreadthFirstSearch();
  let gen = generate(set, source);
  while (gen) {
    yield gen;
    gen = generate(set, source);
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
