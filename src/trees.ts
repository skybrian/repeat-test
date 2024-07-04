import { IntPicker, PickRequest } from "./picks.ts";

/** Incidates that the subtree rooted at a branch has been fully explored. */
const CLOSED = Symbol("closed");

/**
 * The state of a subtree.
 *
 * An undefined branch is not being tracked. It hasn't been visited,
 * or the probability of a duplicate is too low to be worth tracking.
 */
type Branch = undefined | Node | typeof CLOSED;

/**
 * A search tree node for keeping track of which playouts already happened.
 *
 * Invariant: req.size === branches.length.
 *
 * Invariant: branchesLeft is the count of branches not set to CLOSED.
 */
type Node = {
  readonly req: PickRequest;

  /**
   * Given a pick, the index of its branch is pick - req.min.
   */
  readonly branches: Branch[];

  /**
   * The number of branches that aren't set to CLOSED.
   *
   * Invariant: this is at least one for nodes in the tree. (Otherwise the node
   * should have been removed.)
   */
  branchesLeft: number;
};

/**
 * A picker than can be closed to mark the end of a playout.
 */
export interface ClosablePicker extends IntPicker {
  close(): void;
}

class Cursor implements ClosablePicker {
  /**
   * If parent is undefined, we are no longer tracking this playout.
   */
  private parent?: Node;
  private branch: number;

  /**
   * The most-recently-seen branch where there was an alternative.
   *
   * This is used to prune subtrees with no branches.
   */
  private lastDecision: { parent: Node; branch: number };

  /**
   * The odds that a playout other than the one we're on would have been picked
   * instead, assuming available branches were picked from a uniform
   * distribution.
   *
   * For example, if set to 0, that means there was no alternative pick. The
   * odds are 0:1, or 0%. A value of 1 means the odds are 1:1 or a 50%
   * probability.
   */
  private notTakenOdds: number;

  constructor(
    start: Node,
    private readonly wrapped: IntPicker,
    private playoutsLeft: number,
  ) {
    if (start.branches.length !== 1) {
      throw new Error("start should have exactly one branch");
    } else if (start.branches[0] === CLOSED) {
      throw new Error("root should not be CLOSED");
    }
    this.parent = start;
    this.branch = 0;

    // The last decision was to decide to do a playout at all.
    this.lastDecision = { parent: start, branch: 0 };

    // There's no alternative to visiting the root.
    this.notTakenOdds = 0;
  }

  /**
   * Recomputes the odds after taking a branch.
   * @param branchCount the number of branches that could have been taken.
   */
  private updateOdds(branchCount: number) {
    if (branchCount < 1) throw new Error("branchCount must be at least 1");
    this.notTakenOdds = this.notTakenOdds * branchCount + (branchCount - 1);
  }

  pick(req: PickRequest): number {
    if (this.parent === undefined) {
      // No longer walking the tree, so pass it through.
      return this.wrapped.pick(req);
    }
    let node = this.parent.branches[this.branch];
    if (node === CLOSED) {
      // We already tried all the leaves in this subtree.
      // (Should this ever happen?)
      this.parent = undefined;
      return req.default;
    } else if (node === undefined) {
      // See if we should expand the tree
      this.updateOdds(req.size);
      const willReturnProbability = this.playoutsLeft / (1 + this.notTakenOdds);
      if (willReturnProbability < 0.1) {
        // Picking the same playout twice is unlikely, so it's not worth tracking.
        this.parent = undefined;
        return this.wrapped.pick(req);
      }

      // Expand the tree and move down.
      const nextPick = this.wrapped.pick(req);
      node = {
        req,
        branches: Array(req.size).fill(undefined),
        branchesLeft: req.size,
      };
      this.parent.branches[this.branch] = node;
      this.parent = node;
      this.branch = nextPick - req.min;
      if (node.branchesLeft > 1) {
        this.lastDecision = { parent: this.parent, branch: this.branch };
      }
      return nextPick;
    }

    if (node.req.size !== req.size) {
      throw new Error(
        `pick request size doesn't match a previous visit: saw ${node.req.size} choices, got ${req.size}`,
      );
    }

    // Choose a branch that's not taken
    const firstChoice = this.wrapped.pick(req) - req.min;
    let candidate = firstChoice;
    let choice = undefined;
    for (let i = 0; i < req.size; i++) {
      if (node.branches[candidate] !== CLOSED && choice === undefined) {
        choice = candidate;
        // move down
        this.updateOdds(node.branchesLeft);
        this.parent = node;
        this.branch = choice;
        if (node.branchesLeft > 1) {
          this.lastDecision = { parent: this.parent, branch: this.branch };
        }
        return choice + req.min;
      }
      candidate = (candidate + 1) % node.req.size;
    }
    // Ran out of branches. (Shouldn't happen.)
    this.parent = undefined;
    return req.default;
  }

  /**
   * Prevents this playout from being visited again if the playout is still
   * being tracked.
   */
  close() {
    if (this.parent === undefined) {
      return; // can't prune because we're not tracking this playout
    }
    // Mark this path as taken.
    const { parent, branch } = this.lastDecision;
    if (parent.branchesLeft <= 1) {
      throw new Error("lastDecision should only be set if branchesLeft > 1");
    }
    parent.branches[branch] = CLOSED;
    parent.branchesLeft--;
  }
}

/**
 * Tracks which subtrees have been exhaustively searched, to avoid duplicate
 * playouts.
 *
 * Duplicates will only be removed when the previous playout was tracked to the
 * end and {@link ClosablePicker.close} was called on it. The heuristic for
 * whether new tracking nodes are added depends on the number of playouts left
 * and the size of each PickRequest during a playout.
 */
export class SearchTree {
  private readonly start: Node = {
    req: new PickRequest(0, 0),
    branches: [undefined],
    branchesLeft: 2, // the root, and not doing a playout at all
  };

  /**
   * Starts a new playout with the given picker.
   *
   * @param playoutsLeft used to decide whether it's worth tracking this
   * playout. (Tracking is disabled if set to zero.) The playout will
   * only be remembered if
   */
  startPlayout(
    picker: IntPicker,
    playoutsLeft: number,
  ): ClosablePicker | undefined {
    if (this.start.branches[0] === CLOSED) {
      // The search is over; we already tried every possible sequence.
      return undefined;
    }
    return new Cursor(this.start, picker, playoutsLeft);
  }
}
