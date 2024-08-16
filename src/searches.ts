import { alwaysPickMin, IntPicker, PickRequest } from "./picks.ts";
import { PlayoutSource } from "./backtracking.ts";
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
export class PlayoutSearch extends PlayoutSource {
  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();

  private pickSource: IntPicker = alwaysPickMin;

  setOptions(opts: SearchOpts) {
    this.pickSource = opts.pickSource;
  }

  getReplies(start?: number, end?: number): number[] {
    return this.walk.getPicks(start, end);
  }

  protected startPlayout(depth: number): void {
    this.walk.trim(depth);
  }

  protected maybePick(req: PickRequest): number {
    const firstChoice = this.pickSource.pick(req);
    const pick = this.walk.pushUnpruned(firstChoice, req);
    return pick;
  }

  protected nextPlayout(): number | undefined {
    this.walk.prune();
    return this.walk.pruned ? undefined : this.walk.depth;
  }
}
