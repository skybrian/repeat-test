import { assert } from "@std/assert";
import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickList, PickRequest } from "./picks.ts";
import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";

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
 * {@link breadthFirstSearch}.
 *
 * Duplicates may happen with small probability when doing a random search,
 * because visits to nodes with many branches won't be tracked.  The heuristic
 * depends on the {@link SearchOpts.expectedPlayouts} setting, which can be
 * increased to do more tracking during a large search.
 */
export class PlayoutSearch implements PlayoutPicker {
  private state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";

  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();
  private readonly reqs: PickRequest[] = [];
  #trimmedDepth = 0;

  private pickSource: IntPicker = alwaysPickMin;

  private replaceRequest: RequestFilter = (_parent, req) => req;
  private acceptPlayout: PlayoutFilter = () => true;

  constructor() {}

  setOptions(opts: SearchOpts) {
    assert(
      this.state === "ready" || this.state === "playoutDone",
      "setOptions called in the wrong state",
    );
    this.pickSource = opts.pickSource ?? this.pickSource;
    this.replaceRequest = opts.replaceRequest ?? this.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout ?? this.acceptPlayout;
    this.walk.trim(0);
    this.reqs.length = 0;
    this.#trimmedDepth = 0;
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

  private recalculateTrimmedDepth() {
    const picks = this.walk.getPicks();
    while (
      picks.length > 0 && picks.at(-1) === this.reqs[picks.length - 1].min
    ) {
      picks.pop();
    }
    this.#trimmedDepth = picks.length;
  }

  private removePlayout() {
    this.walk.prune();
    this.reqs.length = this.walk.depth;
    this.recalculateTrimmedDepth();
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
    this.recalculateTrimmedDepth();
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
    if (pick > req.min) {
      this.#trimmedDepth = this.reqs.length;
    }
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

  get trimmedDepth(): number {
    return this.#trimmedDepth;
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
export function configureBreadthFirstPass(
  search: PlayoutSearch,
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
export function* breadthFirstSearch(): Iterable<PlayoutPicker> {
  let maxDepth = 0;
  let pruned = true;
  while (pruned) {
    pruned = false;
    const search = new PlayoutSearch();
    configureBreadthFirstPass(search, maxDepth, () => {
      pruned = true;
    });
    while (!search.done) {
      yield search;
      assert(!search.picking);
    }
    maxDepth++;
  }
}
