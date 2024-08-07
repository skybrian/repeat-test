import { assert } from "@std/assert";
import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickList, PickRequest } from "./picks.ts";
import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";
import { PickSet } from "./pick_function.ts";
import { generate, Generated } from "./generated_class.ts";

type RequestFilter = (
  depth: number,
  req: PickRequest,
) => PickRequest | undefined;

type PlayoutFilter = (depth: number) => boolean;

export type SearchOpts = {
  /**
   * Used when deciding which branch to take in the search tree.
   *
   * Note that sometimes the picked branch has been pruned, in which case a
   * different pick will be used.
   */
  pickSource?: IntPicker;

  /**
   * Replaces each incoming pick request with a new one. The new request might
   * have a narrower range. If the callback returns undefined, the playout will
   * be cancelled.
   */
  replaceRequest?: RequestFilter;
  acceptPlayout?: PlayoutFilter;
};

/**
 * A search over all possible pick sequences (playouts).
 *
 * It avoids duplicate playouts by recording each pick in a search tree. For
 * small search trees where every pick is recorded, eventually every playout
 * will be eliminated and the search will end.
 *
 * The default search is depth-first, but it can also be configured to pick
 * randomly using {@link SearchOpts.pickSource}. For a breadth-first search, see
 * {@link pickers}.
 *
 * Duplicates may happen with small probability when doing a random search,
 * because visits to nodes with many branches won't be tracked.  The heuristic
 * depends on the {@link SearchOpts.expectedPlayouts} setting, which can be
 * increased to do more tracking during a large search.
 */
export class Search implements PlayoutPicker {
  private state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";

  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();
  private readonly reqs: PickRequest[] = [];

  private pickSource: IntPicker = alwaysPickMin;

  private replaceRequest: RequestFilter = (_parent, req) => req;
  private acceptPlayout: PlayoutFilter = () => true;

  constructor() {}

  setOptions(opts: SearchOpts) {
    assert(
      this.state === "ready",
      "setOptions called in the wrong state",
    );
    this.pickSource = opts.pickSource ?? this.pickSource;
    this.replaceRequest = opts.replaceRequest ?? this.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout ?? this.acceptPlayout;
    this.walk.trim(0);
    this.reqs.length = 0;
    return true;
  }

  /** Returns true if a playout is in progress. */
  get picking() {
    return this.state === "picking";
  }

  /** Returns true if no more playouts are available and the search is done. */
  get done() {
    return this.state === "searchDone";
  }

  private removePlayout() {
    this.walk.prune();
    this.reqs.length = this.walk.depth;
    this.state = this.walk.pruned ? "searchDone" : "playoutDone";
  }

  startAt(depth: number): boolean {
    if (this.state === "searchDone") {
      return false;
    }
    if (this.state === "ready") {
      this.state = "picking";
      return true;
    } else if (this.state === "picking") {
      this.removePlayout(); // should change state
    }
    if (this.state !== "playoutDone") {
      return false;
    } else if (depth > this.depth) {
      return false;
    }
    this.walk.trim(depth);
    this.reqs.length = depth;
    this.state = "picking";
    return true;
  }

  maybePick(req: PickRequest): Success<number> | Pruned {
    assert(this.state === "picking", "maybePick called in the wrong state");

    const replaced = this.replaceRequest(this.depth, req);
    if (replaced === undefined) {
      this.removePlayout();
      return new Pruned("filtered by replaceRequest");
    }

    const firstChoice = this.pickSource.pick(replaced);
    const pick = this.walk.pushUnpruned(firstChoice, replaced);
    this.reqs.push(req);
    return success(pick);
  }

  endPlayout(): boolean {
    assert(this.state === "picking", "finishPlayout called in the wrong state");
    const accepted = this.acceptPlayout(this.walk.depth);
    this.removePlayout();
    return accepted;
  }

  get depth(): number {
    return this.walk.depth;
  }

  getPicks(start?: number, end?: number): PickList {
    assert(this.state === "picking", "getPicks called in the wrong state");
    start = start ?? 0;
    assert(start >= 0);
    end = end ?? this.walk.depth;
    assert(end >= start);
    return new PickList(
      this.reqs.slice(start, end),
      this.walk.getPicks(start, end),
    );
  }
}

/**
 * Configures a search to run a breadth-first pass.
 * @param passIdx the number of previous passes that were run.
 * @param more called if more passes are needed.
 */
export function configurePass(
  search: Search,
  passIdx: number,
  more: () => void,
) {
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

  search.setOptions({
    replaceRequest,
    acceptPlayout,
  });
}

/**
 * Iterates over all playouts in breadth-first order, using iterative deepening.
 *
 * (The iterable can only be iterated over once.)
 *
 * Note: to avoid duplicate playouts, the return value of
 * {@link PlayoutPicker.endPlayout} must be used to filter them.
 */
export function* pickers(): Iterable<PlayoutPicker> {
  let maxDepth = 0;
  let pruned = true;
  while (pruned) {
    pruned = false;
    const search = new Search();
    configurePass(search, maxDepth, () => {
      pruned = true;
    });
    while (!search.done) {
      yield search;
      assert(!search.picking);
    }
    maxDepth++;
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
  for (const picker of pickers()) {
    // Keep using the same picker until it's finished.
    let gen = generate(set, picker);
    while (gen) {
      yield gen;
      gen = generate(set, picker);
    }
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

/**
 * Returns up to n examples from this Arbitrary, in the same order as
 * {@link generateAll}.
 *
 * There may be duplicates.
 */
export function take<T>(set: PickSet<T>, n: number): T[] {
  const result = [];
  for (const gen of generateAll(set)) {
    result.push(gen.val);
    if (result.length >= n) {
      break;
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
