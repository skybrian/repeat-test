import { assert } from "@std/assert";
import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickRequest } from "./picks.ts";
import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";

export type SearchOpts = {
  /**
   * Used when deciding which branch to take in the search tree.
   *
   * Note that sometimes the picked branch has been pruned, in which case a
   * different pick will be used.
   */
  pickSource: IntPicker;
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
export class PlayoutSearch extends PlayoutPicker {
  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();
  #trimmedDepth = 0;

  private pickSource: IntPicker = alwaysPickMin;

  setOptions(opts: SearchOpts) {
    assert(
      this.state === "ready" || this.state === "playoutDone",
      "setOptions called in the wrong state",
    );
    this.pickSource = opts.pickSource;
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

    const firstChoice = this.pickSource.pick(req);
    const pick = this.walk.pushUnpruned(firstChoice, req);
    this.reqs.push(req);
    if (pick > req.min) {
      this.#trimmedDepth = this.reqs.length;
    }
    return success(pick);
  }

  endPlayout(): boolean {
    assert(this.state === "picking", "finishPlayout called in the wrong state");
    this.removePlayout();
    return true;
  }

  get trimmedDepth(): number {
    return this.#trimmedDepth;
  }

  protected getReplies(start?: number, end?: number): number[] {
    return this.walk.getPicks(start, end);
  }
}
