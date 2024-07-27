import { PickList, PickRequest } from "./picks.ts";
import { Node, PRUNED } from "./search_tree.ts";
import Arbitrary, { PickFunction } from "./arbitrary_class.ts";

export class Urn<T> {
  private start: Node = Node.tracked(new PickRequest(0, 0));

  constructor(readonly arb: Arbitrary<T>) {}

  isEmpty(): boolean {
    return this.start.branchesLeft === 0;
  }

  /**
   * Attempts to pick a value using picks that weren't previously used.
   *
   * @throws {@link Pruned} if the picks were used already.
   */
  takeOne(pick: PickFunction): T {
    let lastPicks: PickList | undefined = undefined;

    const acceptPicks = (picks: PickList) => {
      lastPicks = picks;
      const replies = picks.replies();
      let branch = this.start.getBranch(0);
      let i = 0;
      while (true) {
        if (branch == PRUNED) {
          return false;
        } else if (branch === undefined) {
          // unexplored
          return true;
        } else if (i === replies.length) {
          return true;
        }
        branch = branch.getBranch(replies[i]);
        i++;
      }
    };

    const prune = (picks: PickList) => {
      const reqs = picks.reqs();
      const replies = picks.replies();
      let parent = this.start;
      let parentPick = 0;
      const nodePath: Node[] = [];
      const pickPath: number[] = [];
      for (let i = 0; i < reqs.length; i++) {
        let branch = parent.getBranch(parentPick);
        if (branch == PRUNED) {
          return;
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
      parent.prune(parentPick);
      while (parent.branchesLeft === 0) {
        const parent = nodePath.pop();
        if (parent === undefined) {
          return;
        }
        const parentPick = pickPath.pop();
        if (parentPick === undefined) {
          throw new Error("nodePath and pickPath should be the same length");
        }
        parent.prune(parentPick);
      }
    };

    const val = pick(this.arb, { acceptPicks });
    if (lastPicks === undefined) {
      throw new Error("lastPicks should be defined");
    }
    prune(lastPicks);
    return val;
  }
}
