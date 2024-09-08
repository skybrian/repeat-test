import { alwaysPickMin, type IntPicker, type PickRequest } from "./picks.ts";
import { PlayoutSource } from "./backtracking.ts";
import { PickTree } from "./pick_tree.ts";

/**
 * Picks playouts, sometimes remembering them to avoid duplicates.
 *
 * For a small search trees, it records every pick. Eventually every playout
 * will be pruned and no more playouts will be generated. The search will end.
 *
 * For very wide search trees, sometimes playouts won't be recorded to save
 * memory. This happens when the probability of revisiting them is too low.
 *
 * The default search is depth-first, but it can also be configured to pick
 * randomly using {@link pickSource}.
 */
export class PartialTracker extends PlayoutSource {
  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();

  private odds: number[] = [];

  /**
   * Used when deciding which branch to take in the search tree.
   *
   * Note that sometimes the picked branch has been pruned, in which case a
   * different pick will be used.
   */
  pickSource: IntPicker = alwaysPickMin;

  getReplies(): number[] {
    return this.walk.getReplies();
  }

  protected startPlayout(depth: number): void {
    this.walk.trim(depth);
    this.odds.length = depth;
  }

  protected maybePick(req: PickRequest): number {
    const depth = this.odds.length;
    const newOdds = depth > 0 ? this.odds[depth - 1] * (1 / req.size) : 1;
    this.odds.push(newOdds);

    const firstChoice = this.pickSource.pick(req);
    const pick = this.walk.pushUnpruned(firstChoice, req, {
      track: newOdds > 0.000001,
    });
    return pick;
  }

  protected nextPlayout(): number | undefined {
    this.walk.prune();
    return this.walk.pruned ? undefined : this.walk.depth;
  }
}
