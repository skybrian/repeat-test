import type { IntPicker, IntRequest } from "./picks.ts";
import type { Tracker } from "./backtracking.ts";

import { alwaysPickMin } from "./picks.ts";
import { PickTree } from "./pick_tree.ts";
import { Backtracker } from "./backtracking.ts";

/**
 * Picks playouts based on an IntPicker (usually random).
 *
 * Sometimes tracks picks from previous playouts to avoid duplicate playouts.
 *
 * For a small search trees, it records every pick. Eventually every playout
 * will be pruned and no more playouts will be generated. The search will end.
 *
 * For very wide search trees, playouts won't be recorded until the same node
 * is visited enough times, to save memory.
 */
export class PartialTracker implements Tracker {
  readonly tree: PickTree = new PickTree();

  private readonly walk = this.tree.walk();
  private odds: number[] = [];

  pickSource: IntPicker;

  constructor(picker: IntPicker) {
    this.pickSource = picker;
  }

  startPlayout(depth: number): void {
    this.walk.trim(depth);
    this.odds.length = depth;
  }

  maybePick(req: IntRequest): number {
    const depth = this.odds.length;
    const newOdds = depth > 0 ? this.odds[depth - 1] * (1 / req.size) : 1;
    this.odds.push(newOdds);

    // Track the pick if the odds of coming back are high enough, or
    // we revisited this node enough times that the odds are probably wrong.
    const track = newOdds > 0.000001 || this.walk.untrackedVisits > req.size;

    const firstChoice = this.pickSource.pick(req);
    const pick = this.walk.pushUnpruned(firstChoice, req, { track });
    return pick;
  }

  nextPlayout(): number | undefined {
    this.walk.prune();
    return this.walk.pruned ? undefined : this.walk.depth;
  }
}

/**
 * Playouts in depth-first order, starting with all minimum picks.
 */
export function depthFirstPlayouts(): Backtracker {
  return new Backtracker(new PartialTracker(alwaysPickMin));
}
