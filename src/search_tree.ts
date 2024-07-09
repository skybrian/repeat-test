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
 * Invariant: branchesLeft is the count of branches not set to PRUNED.
 *
 * Invariant: `branchesLeft >= 1` for nodes in the tree. (Otherwise, the node
 * should have been removed.)
 */
class Node {
  [key: number]: Branch;

  readonly #req: PickRequest;

  #tracked: boolean;
  #branchesLeft: number;

  constructor(req: PickRequest, track: boolean) {
    this.#req = req;
    this.#tracked = track;
    this.#branchesLeft = req.size;
  }

  get req(): PickRequest {
    return this.#req;
  }

  get tracked(): boolean {
    return this.#tracked;
  }

  getBranch(pick: number): Branch {
    if (!this.#tracked) return undefined;
    return this[pick - this.req.min];
  }

  setBranch(pick: number, node: Node): boolean {
    if (!this.#tracked) return false;
    this[pick - this.req.min] = node;
    return true;
  }

  /** The number of unpruned branches. */
  get branchesLeft(): number {
    return this.#branchesLeft;
  }

  findUnprunedPick(firstChoice: number): number | undefined {
    if (!this.#tracked) return undefined;
    const size = this.req.size;
    let pick = firstChoice;
    for (let i = 0; i < size; i++) {
      const branch = this[pick - this.req.min];
      if (branch !== PRUNED) return pick;
      pick++;
      if (pick > this.#req.max) pick = this.#req.min;
    }
    return undefined;
  }

  prune(pick: number): boolean {
    if (!this.#tracked) return false;
    this[pick - this.req.min] = PRUNED;
    this.#branchesLeft--;
    return true;
  }
}

interface CursorParent {
  checkAlive(version: number): void;
  get playoutsLeft(): number;
  endPlayout(): void;
  endSearch(): void;
}

export class Cursor implements RetryPicker {
  /* Invariant: `nodes.length === picks.length` */

  /**
   * The nodes used in the current playout. The 'start' node is at index 0, and
   * it points to the root at index 1.
   */
  private readonly nodes: Node[];
  /**
   * The picks made in the current playout. The pick at index 0 is always 0,
   * pointing to the root node.
   */
  private readonly picks: number[];

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

  constructor(
    private readonly tree: CursorParent,
    private readonly wrapped: IntPicker,
    private readonly version: number,
    start: Node,
  ) {
    this.nodes = [start];
    this.picks = [0];
  }

  get isRandom(): boolean {
    return false;
  }

  getNodes(): Node[] {
    this.tree.checkAlive(this.version);
    return this.nodes;
  }

  /** Returns true if the current playout is tracked so far. */
  get tracked(): boolean {
    return this.nodes[this.nodes.length - 1].tracked;
  }

  /**
   * Prunes the current playout if the last fork is at the given depth or higher.
   *
   * If it returns false, the last fork is at a lower depth.
   */
  prune(depth: number) {
    const nodes = this.getNodes();
    const picks = this.picks;
    for (let i = nodes.length - 1; i > depth; i--) {
      const parent = nodes[i];
      if (parent.branchesLeft > 1) {
        parent.prune(picks[i]);
        return true;
      }
    }
    return false;
  }

  getPickedBranch(i: number): Branch {
    const parent = this.getNodes()[i];
    const pick = this.getPicks()[i];
    return parent.getBranch(pick);
  }

  /**
   * Recomputes the odds after taking a branch.
   * @param branchCount the number of branches that could have been taken.
   */
  private updateOdds(branchCount: number) {
    if (!this.wrapped.isRandom) return;

    if (branchCount < 1) throw new Error("branchCount must be at least 1");
    this.notTakenOdds = this.notTakenOdds * branchCount + (branchCount - 1);
  }

  private recalculateOdds() {
    if (!this.wrapped.isRandom) return;

    this.notTakenOdds = 0;
    for (const node of this.getNodes()) {
      this.updateOdds(node.req.size);
    }
  }

  get depth(): number {
    return this.getNodes().length - 1;
  }

  getPicks(): number[] {
    return this.picks.slice(1);
  }

  private pickUntracked(req: PickRequest): number {
    const pick = this.wrapped.pick(req);
    this.getNodes().push(new Node(req, false));
    this.picks.push(pick);
    return pick;
  }

  pick(req: PickRequest): number {
    const nodes = this.getNodes();
    const parent = nodes[nodes.length - 1];
    if (!parent.tracked) {
      return this.pickUntracked(req);
    }
    const picks = this.picks;
    const parentPick = picks[picks.length - 1];
    let node = parent.getBranch(parentPick);
    if (node === PRUNED) {
      throw new Error("internal error: parent picked a pruned branch");
    } else if (node === undefined) {
      // See if we should expand the tree.
      // If picking the same playout twice is unlikely, it's not worth tracking.
      if (this.wrapped.isRandom) {
        this.updateOdds(req.size);
        const willReturnProbability = this.tree.playoutsLeft /
          (1 + this.notTakenOdds);
        if (willReturnProbability < 0.5) {
          return this.pickUntracked(req);
        }
      }

      // Expand the tree and push the node.
      const nextPick = this.wrapped.pick(req);
      node = new Node(req, true);
      parent.setBranch(parentPick, node);
      nodes.push(node);
      picks.push(nextPick);
      return nextPick;
    }

    if (node.req.min !== req.min || node.req.max != req.max) {
      throw new Error(
        `pick request range doesn't match a previous visit`,
      );
    }
    if (!node.tracked) {
      return this.pickUntracked(req);
    }
    const pick = node.findUnprunedPick(this.wrapped.pick(req));
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }

    // move down
    this.updateOdds(node.branchesLeft);
    nodes.push(node);
    picks.push(pick);
    return pick;
  }

  /**
   * Returns true if there is a playout to try at the given depth. Otherwise,
   * the caller should backtrack more.
   */
  backTo(depth: number): boolean {
    const nodes = this.getNodes();
    if (depth < 0 || depth > nodes.length - 1) {
      throw new Error(
        "depth must be between 0 and " + (nodes.length - 1),
      );
    }
    if (!this.prune(depth)) {
      if (depth === 0) {
        this.tree.endSearch();
      }
      return false;
    }
    if (this.getPickedBranch(depth) === PRUNED) {
      throw new Error("went back to pruned branch");
    }
    const picks = this.picks;
    while (nodes.length > depth + 1) {
      nodes.pop();
      picks.pop();
    }
    this.tree.endPlayout();
    this.recalculateOdds();
    return true;
  }
}

/**
 * Creates pickers that avoid duplicate playouts.
 *
 * A playout is a sequence of picks, ending with a successful call to
 * {@link backTo}, which starts the next playout, or by creating a new picker.
 *
 * Duplicates are only avoided when a playout is tracked to the end. Whether
 * this happens depends on the picker: For non-random pickers (where
 * {@link IntPicker.isRandom} is false), tracking is always turned on. Random
 * pickers will often avoid duplicates on their own, so tracking is turned on
 * based on a heuristic.
 */
export class SearchTree {
  private start: Node | undefined = new Node(new PickRequest(0, 0), true);

  #pickerCount = 0;

  private cursor: Cursor | undefined;

  private callbacks: CursorParent;

  /**
   * @param expectedPlayouts the number of playouts that are expected. This is
   * used for determining whether random playouts will be tracked. If set to
   * zero, tracking for random pickers is disabled.
   */
  constructor(expectedPlayouts: number) {
    const checkAlive = (version: number) => {
      if (version !== this.#pickerCount) {
        throw new Error("picker accessed after another playout started");
      }
      if (this.searchDone) {
        throw new Error("picker accessed after the search ended");
      }
    };

    let playoutsLeft = expectedPlayouts;

    this.callbacks = {
      checkAlive,
      get playoutsLeft() {
        return playoutsLeft;
      },
      endPlayout: () => {
        if (playoutsLeft > 0) {
          playoutsLeft--;
        }
      },
      endSearch: () => {
        this.start = undefined;
        playoutsLeft = 0;
      },
    };
  }

  /**
   * The number of pickers constructed.
   * (Also, the version number of the picker currently being used.)
   */
  get pickersCreated(): number {
    return this.#pickerCount;
  }

  get searchDone(): boolean {
    return this.start === undefined;
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

  makePicker(wrapped: IntPicker): Cursor | undefined {
    if (this.cursor) {
      if (!this.searchDone) {
        this.cursor.backTo(0);
      }
      this.cursor = undefined;
    }

    const start = this.start;
    if (start === undefined) return undefined;

    const version = ++this.#pickerCount;

    this.cursor = new Cursor(this.callbacks, wrapped, version, start);
    return this.cursor;
  }
}
