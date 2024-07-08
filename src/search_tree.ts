import { IntPicker, PickRequest, RetryPicker } from "./picks.ts";

/** Indicates that the subtree rooted at a branch has been fully explored. */
const PRUNED = Symbol("pruned");

/**
 * The state of a subtree.
 *
 * An undefined branch is not being tracked (yet). Either it hasn't been
 * visited, or the probability of a duplicate is too low to be worth tracking.
 */
type Branch = undefined | Node | typeof PRUNED;

/**
 * A search tree node for keeping track of which playouts already happened.
 *
 * Invariant: `req.size === branches.length`.
 *
 * Invariant: branchesLeft is the count of branches not set to PRUNED.
 *
 * Invariant: `branchesLeft >= 1` for nodes in the tree. (Otherwise, the node
 * should have been removed.)
 */
class Node {
  /**
   * If present, playouts are being tracked for this node.
   *
   * Given a pick, the index of its branch is `pick - req.min`.
   */
  #branches?: Branch[];

  #branchesLeft: number;

  constructor(readonly req: PickRequest, track: boolean) {
    this.#branches = track ? Array(req.size).fill(undefined) : undefined;
    this.#branchesLeft = req.size;
  }

  get tracked(): boolean {
    return this.#branches !== undefined;
  }

  getBranch(pick: number): Branch {
    if (!this.#branches) return undefined;
    return this.#branches[pick - this.req.min];
  }

  setBranch(pick: number, node: Node): boolean {
    if (!this.#branches) return false;
    this.#branches[pick - this.req.min] = node;
    return true;
  }

  /** The number of unpruned branches. */
  get branchesLeft(): number {
    return this.#branchesLeft;
  }

  findUnprunedPick(firstChoice: number): number | undefined {
    const branches = this.#branches;
    if (!branches) return undefined;
    const size = branches.length;
    let idx = firstChoice - this.req.min;
    for (let i = 0; i < size; i++) {
      if (branches[idx] !== PRUNED) return idx + this.req.min;
      idx++;
      if (idx == size) idx = 0;
    }
    return undefined;
  }

  prune(pick: number): boolean {
    if (!this.#branches) return false;
    this.#branches[pick - this.req.min] = PRUNED;
    this.#branchesLeft--;
    return true;
  }
}

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
  private readonly nodes: Node[] = [new Node(new PickRequest(0, 0), true)];

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

  /** The picker currently being used. */
  private currentVersion = 0;

  private done = false;

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
   * Prunes the current playout if the last fork is at the given depth or higher.
   *
   * If it returns false, the last fork is at a lower depth.
   */
  private prune(depth: number) {
    for (let i = this.nodes.length - 1; i > depth; i--) {
      const node = this.nodes[i];
      if (node.branchesLeft > 1) {
        node.prune(this.picks[i]);
        return true;
      }
    }
    return false;
  }

  private getPickedBranch(i: number): Branch {
    const parent = this.nodes[i];
    const pick = this.picks[i];
    return parent.getBranch(pick);
  }

  /** Returns true if the current playout is tracked so far. */
  get tracked(): boolean {
    return this.nodes[this.nodes.length - 1].tracked;
  }

  pickers(wrapped: IntPicker): IterableIterator<RetryPicker> {
    const pickers: IterableIterator<RetryPicker> = {
      [Symbol.iterator]() {
        return pickers;
      },
      next: (): IteratorResult<RetryPicker, void> => {
        const value = this.makePicker(wrapped);
        const done = value === undefined;
        if (done) {
          return { done, value: undefined };
        } else {
          return { done, value };
        }
      },
    };
    return pickers;
  }

  makePicker(wrapped: IntPicker): RetryPicker | undefined {
    if (this.done) return undefined;
    this.currentVersion++;
    const version = this.currentVersion;

    const checkAlive = () => {
      if (version !== this.currentVersion) {
        throw new Error("picker accessed after another was made");
      }
    };

    const getNodes = () => {
      checkAlive();
      return this.nodes;
    };

    const getPicks = (): number[] => {
      checkAlive();
      return this.picks.slice(1);
    };

    const pickUntracked = (req: PickRequest): number => {
      const pick = wrapped.pick(req);
      this.nodes.push(new Node(req, false));
      this.picks.push(pick);
      return pick;
    };

    const pick = (req: PickRequest): number => {
      const nodes = getNodes();
      const parent = nodes[nodes.length - 1];
      if (!parent.tracked) {
        return pickUntracked(req);
      }
      const parentPick = this.picks[this.picks.length - 1];
      let node = parent.getBranch(parentPick);
      if (node === PRUNED) {
        throw new Error("internal error: parent picked a pruned branch");
      } else if (node === undefined) {
        // See if we should expand the tree.
        // If picking the same playout twice is unlikely, it's not worth tracking.
        this.updateOdds(req.size);
        if (req.size > 1000 || this.willReturnProbability < 0.5) {
          return pickUntracked(req);
        }

        // Expand the tree and push the node.
        const nextPick = wrapped.pick(req);
        node = new Node(req, true);
        parent.setBranch(parentPick, node);
        nodes.push(node);
        this.picks.push(nextPick);
        return nextPick;
      }

      if (node.req.min !== req.min || node.req.max != req.max) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      if (!node.tracked) {
        return pickUntracked(req);
      }
      const pick = node.findUnprunedPick(wrapped.pick(req));
      if (pick === undefined) {
        throw new Error("internal error: node has no unpruned picks");
      }

      // move down
      this.updateOdds(node.branchesLeft);
      nodes.push(node);
      this.picks.push(pick);
      return pick;
    };

    /**
     * Returns true if there is a playout to try at the given depth. Otherwise,
     * the caller should backtrack more.
     */
    const backTo = (depth: number): boolean => {
      const nodes = getNodes();
      if (depth < 0 || depth > nodes.length - 1) {
        throw new Error(
          "depth must be between 0 and " + (nodes.length - 1),
        );
      }
      if (!this.prune(depth)) {
        if (depth === 0) {
          // Prune the root, ending the search.
          this.done = true;
        }
        return false;
      }
      if (this.getPickedBranch(depth) === PRUNED) {
        throw new Error("went back to pruned branch");
      }
      while (nodes.length > depth + 1) {
        nodes.pop();
        this.picks.pop();
      }
      this.playoutsLeft--;
      this.recalculateOdds();
      return true;
    };

    if (version > 1) {
      if (!backTo(0)) return undefined;
    }

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
