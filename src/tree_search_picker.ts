import { IntPicker, PickRequest, RetryPicker } from "./picks.ts";

/** Indicates that the subtree rooted at a branch has been fully explored. */
const CLOSED = Symbol("closed");

/**
 * The state of a subtree.
 *
 * An undefined branch is not being tracked (yet). Either it hasn't been
 * visited, or the probability of a duplicate is too low to be worth tracking.
 */
type Branch = undefined | Node | typeof CLOSED;

/**
 * A search tree node for keeping track of which playouts already happened.
 *
 * Invariant: `req.size === branches.length`.
 *
 * Invariant: branchesLeft is the count of branches not set to CLOSED.
 *
 * Invariant: `branchesLeft >= 1` for nodes in the tree. (Otherwise, the node
 * should have been removed.)
 */
type Node = {
  readonly req: PickRequest;

  /**
   * If present, playouts are being tracked for this node.
   *
   * Given a pick, the index of its branch is `pick - req.min`.
   */
  readonly branches?: Branch[];

  /**
   * The number of branches that aren't set to CLOSED.
   */
  branchesLeft: number;
};

/**
 * Creates pickers that avoid duplicate playouts.
 *
 * A playout is a sequence of picks, ending with a successful call to
 * {@link backTo}, which starts the next playout.
 *
 * Duplicates are only avoided when a playout is tracked to the end. Tracking is
 * determined by a heuristic that depends on the estimated number of playouts
 * left and the size of each PickRequest's range being small enough to be worth
 * tracking.
 */
export class SearchTree {
  /**
   * The nodes visited as part of the current playout. The first node is
   * a dummy node that points to the root node.
   */
  private readonly nodes: Node[] = [{
    req: new PickRequest(0, 0),
    branches: [undefined],
    branchesLeft: 1, // Ensures that the root gets closed at the end of the search.
  }];

  /** Picks made as part of the first playout. (The first one is a dummy.) */
  private readonly picks = [0];

  /**
   * The odds that a playout other than the one we're on would have been picked
   * instead, assuming available branches were picked from a uniform
   * distribution.
   *
   * For example, if set to 0, that means there was no alternative pick. The
   * odds are 0:1, or 0%. A value of 1 means the odds are 1:1 or a 50%
   * probability.
   */
  private notTakenOdds = 0;

  private playoutsLeft: number;

  /**
   * @param expectedPlayouts the number of playouts that are expected. If set
   * to zero, playout tracking is turned off.
   */
  constructor(expectedPlayouts: number) {
    this.playoutsLeft = expectedPlayouts;
  }

  /**
   * Recomputes the odds after taking a branch.
   * @param branchCount the number of branches that could have been taken.
   */
  private updateOdds(branchCount: number) {
    if (branchCount < 1) throw new Error("branchCount must be at least 1");
    this.notTakenOdds = this.notTakenOdds * branchCount + (branchCount - 1);
  }

  private recalculateOdds() {
    this.notTakenOdds = 0;
    for (const node of this.nodes) {
      this.updateOdds(node.req.size);
    }
  }

  private get willReturnProbability() {
    return this.playoutsLeft / (1 + this.notTakenOdds);
  }

  /**
   * Close the current playout if it's at the given depth or deeper.
   *
   * If it returns false, no alternative playout is available. (The
   * last alternative was before the given depth.)
   */
  private closePlayout(depth: number) {
    for (let i = this.nodes.length - 1; i > depth; i--) {
      const node = this.nodes[i];
      if (node.branches === undefined) {
        // Wasn't tracked; can't close it.
        return true;
      } else if (node.branchesLeft > 1) {
        // There is an alternate branch at this index.
        const branch = this.picks[i] - node.req.min;
        node.branches[branch] = CLOSED;
        node.branchesLeft--;
        // console.log(`closed branch ${branch} at depth ${depth}`);
        return true;
      }
    }
    return false;
  }

  private pickedBranchAt(i: number): Branch {
    const parent = this.nodes[i];
    const branches = parent.branches;
    if (branches === undefined) return undefined;

    const parentPick = this.picks[this.picks.length - 1];
    return branches[parentPick - parent.req.min];
  }

  /** Returns true if the current playout is tracked so far. */
  get tracked(): boolean {
    return this.nodes[this.nodes.length - 1].branches !== undefined;
  }

  makePicker(wrapped: IntPicker): RetryPicker {
    const getPicks = (): number[] => {
      return this.picks.slice(1);
    };

    const pickUntracked = (req: PickRequest): number => {
      const pick = wrapped.pick(req);
      this.nodes.push({ req, branchesLeft: req.size });
      this.picks.push(pick);
      return pick;
    };

    const pick = (req: PickRequest): number => {
      const parent = this.nodes[this.nodes.length - 1];
      if (parent.branches === undefined) {
        // Not tracking branches, so just record the pick.
        return pickUntracked(req);
      }
      const parentPick = this.picks[this.picks.length - 1];
      let node = parent.branches[parentPick - parent.req.min];
      if (node === CLOSED) {
        throw new Error("internal error: parent picked a closed branch");
      } else if (node === undefined) {
        // See if we should expand the tree.
        // If picking the same playout twice is unlikely, it's not worth tracking.
        this.updateOdds(req.size);
        if (req.size > 1000 || this.willReturnProbability < 0.5) {
          return pickUntracked(req);
        }

        // Expand the tree and push the node.
        const nextPick = wrapped.pick(req);
        node = {
          req,
          branches: Array(req.size).fill(undefined),
          branchesLeft: req.size,
        };
        parent.branches[parentPick - parent.req.min] = node;
        this.nodes.push(node);
        this.picks.push(nextPick);
        return nextPick;
      }

      if (node.req.min !== req.min || node.req.max != req.max) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      const branches = node.branches;
      if (branches === undefined) {
        // We've already visited this node, but it's not tracking branches.
        return pickUntracked(req);
      }

      // Choose the first branch that's not taken
      const firstChoice = wrapped.pick(req) - req.min;
      let candidate = firstChoice;
      for (let i = 0; i < req.size; i++) {
        if (branches[candidate] !== CLOSED) {
          const choice = candidate;
          const pick = choice + req.min;
          // move down
          this.updateOdds(node.branchesLeft);
          this.nodes.push(node);
          this.picks.push(pick);
          return pick;
        }
        candidate = (candidate + 1) % node.req.size;
      }
      throw new Error("internal error: node has no branches left");
    };

    /**
     * Returns true if there is a playout to try at the given depth. Otherwise,
     * the caller should backtrack more.
     */
    const backTo = (depth: number): boolean => {
      if (depth < 0 || depth > this.nodes.length - 1) {
        throw new Error(
          "depth must be between 0 and " + (this.nodes.length - 1),
        );
      }
      if (!this.closePlayout(depth)) {
        return false;
      }
      if (this.pickedBranchAt(depth) === CLOSED) {
        throw new Error("went back to closed branch");
      }
      while (this.nodes.length > depth + 1) {
        this.nodes.pop();
        this.picks.pop();
      }
      this.playoutsLeft--;
      this.recalculateOdds();
      return true;
    };

    const getNodes = () => this.nodes;

    const picker: RetryPicker = {
      pick,
      get replaying() {
        return false;
      },
      backTo,
      getPicks,
      get depth() {
        return getNodes().length - 1;
      },
    };

    return picker;
  }
}
