import type { IntPicker, PickRequest } from "./picks.ts";
import type { Tracker } from "./backtracking.ts";

import { alwaysPickMin } from "./picks.ts";
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
export class PartialTracker implements Tracker {
  readonly tree: PickTree = new PickTree();

  private readonly walk = this.tree.walk();
  private odds: number[] = [];

  pickSource: IntPicker = alwaysPickMin;

  getReplies(): number[] {
    return this.walk.getReplies();
  }

  startPlayout(depth: number): void {
    this.walk.trim(depth);
    this.odds.length = depth;
  }

  maybePick(req: PickRequest): number {
    const depth = this.odds.length;
    const newOdds = depth > 0 ? this.odds[depth - 1] * (1 / req.size) : 1;
    this.odds.push(newOdds);

    const firstChoice = this.pickSource.pick(req);
    const pick = this.walk.pushUnpruned(firstChoice, req, {
      track: newOdds > 0.000001,
    });
    return pick;
  }

  acceptPlayout(): boolean {
    return true;
  }

  nextPlayout(): number | undefined {
    this.walk.prune();
    return this.walk.pruned ? undefined : this.walk.depth;
  }
}
