import { PickList, PickRequest } from "./picks.ts";
import { Node, PRUNED } from "./searches.ts";
import Arbitrary, { PickFunction } from "./arbitrary_class.ts";

/**
 * Picks from the possible values generated by an Arbitrary, without
 * replacement.
 *
 * This can be used to generate permutations.
 */
export class Jar<T> {
  private start: Node = Node.tracked(new PickRequest(0, 0));
  private acceptPicks = this.prune.bind(this);

  constructor(readonly arb: Arbitrary<T>) {}

  /**
   * Returns true if there are any values left that haven't been used.
   */
  isEmpty(): boolean {
    return this.start.branchesLeft === 0;
  }

  /**
   * Picks from an arbitrary with a filter that prevents it from using the same
   * pick sequence twice.
   *
   * @throws {@link Pruned} if the picks were used already.
   */
  pickUnused(pick: PickFunction): T {
    return pick(this.arb, { acceptPicks: this.acceptPicks });
  }

  /**
   * Remembers that a pick sequence was visited.
   *
   * Returns true if this was the first time the pick sequence was seen, or
   * false if it was already recorded.
   */
  private prune(picks: PickList): boolean {
    const reqs = picks.reqs();
    const replies = picks.replies();

    let parent = this.start;
    let parentPick = 0;
    const nodePath: Node[] = [];
    const pickPath: number[] = [];

    // walk the tree, adding nodes where needed.
    for (let i = 0; i < reqs.length; i++) {
      let branch = parent.getBranch(parentPick);
      if (branch == PRUNED) {
        return false; // aleady added
      }
      nodePath.push(parent);
      pickPath.push(parentPick);
      if (branch === undefined) {
        // unexplored; add node
        branch = Node.tracked(reqs[i]);
        parent.setBranch(0, branch);
        parent = branch;
        parentPick = replies[i];
      } else {
        parent = branch;
        parentPick = replies[i];
      }
      i++;
    }

    if (parent.getBranch(parentPick) === PRUNED) {
      return false; // aleady added
    }
    parent.prune(parentPick);

    // remove ancestors that are now empty
    while (parent.branchesLeft === 0) {
      const parent = nodePath.pop();
      if (parent === undefined) {
        return true; // pruned the last playout
      }
      const parentPick = pickPath.pop();
      if (parentPick === undefined) {
        throw new Error("nodePath and pickPath should be the same length");
      }
      parent.prune(parentPick);
    }

    return true;
  }
}
