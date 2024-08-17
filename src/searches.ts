import { alwaysPickMin, type IntPicker, type PickRequest } from "./picks.ts";
import { PlayoutSource } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";

/**
 * A search over all possible pick sequences (playouts).
 *
 * It avoids duplicate playouts by recording each pick in a search tree. For
 * small search trees where every pick is recorded, eventually every playout
 * will be eliminated and the search will end.
 *
 * The default search is depth-first, but it can also be configured to pick
 * randomly using {@link pickSource}.
 */
export class PlayoutSearch extends PlayoutSource {
  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();

  /**
   * Used when deciding which branch to take in the search tree.
   *
   * Note that sometimes the picked branch has been pruned, in which case a
   * different pick will be used.
   */
  pickSource: IntPicker = alwaysPickMin;

  getReplies(): number[] {
    return this.walk.getPicks();
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
