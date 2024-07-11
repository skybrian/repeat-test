import {
  alwaysPickDefault,
  IntPicker,
  PickRequest,
  uniformBias,
} from "./picks.ts";

import { RetryPicker } from "./backtracking.ts";

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

  constructor(req: PickRequest, track: boolean, branchCount: number) {
    this.#req = req;
    this.#tracked = track;
    this.#branchesLeft = branchCount;
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

  filterPick(
    firstChoice: number,
    filter: TreeFilter,
    depth: number,
  ): number | undefined {
    const size = this.req.size;
    let pick = firstChoice;
    for (let i = 0; i < size; i++) {
      if (
        filter.accept(depth, this.req, pick) && this.getBranch(pick) !== PRUNED
      ) {
        return pick;
      }
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
  endPlayout(depth: number): void;
  endSearch(): void;
}

/**
 * Restricts the search to a subset of the replies to a request.
 */
export interface TreeFilter {
  /** The number of accepted replies to the given request. */
  branchCount(depth: number, req: PickRequest): number;
  /** Returns true if the reply is accepted. */
  accept(depth: number, req: PickRequest, pick: number): boolean;
}

export const noFilter: TreeFilter = {
  branchCount: (_, req: PickRequest) => req.size,
  accept: () => true,
};

/**
 * Allows only the default choice at depths >= the given depth.
 */
export function defaultOnlyFrom(maxBranchDepth: number): TreeFilter {
  return {
    branchCount: (depth: number, req: PickRequest) =>
      depth >= maxBranchDepth ? 1 : req.size,
    accept: (depth: number, req: PickRequest, pick: number) =>
      depth >= maxBranchDepth ? pick === req.default : true,
  };
}

export type SearchOpts = {
  filter?: TreeFilter;
};

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

  private readonly filter: TreeFilter;

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
    opts: SearchOpts = {},
  ) {
    this.nodes = [start];
    this.picks = [0];
    this.filter = opts.filter ?? noFilter;
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
      this.updateOdds(node.branchesLeft);
    }
  }

  get depth(): number {
    return this.getNodes().length - 1;
  }

  getPicks(): number[] {
    return this.picks.slice(1);
  }

  private nextNode(req: PickRequest) {
    const branchCount = this.filter.branchCount(this.depth, req);

    const nodes = this.getNodes();
    const parent = nodes[nodes.length - 1];
    if (!parent.tracked) {
      return new Node(req, false, branchCount);
    }
    const picks = this.picks;
    const parentPick = picks[picks.length - 1];
    let node = parent.getBranch(parentPick);

    if (node === PRUNED) {
      throw new Error("internal error: parent picked a pruned branch");
    } else if (node !== undefined) {
      // Visit existing node.
      if (node.req.min !== req.min || node.req.max != req.max) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      this.updateOdds(node.branchesLeft);
      return node;
    } else if (this.wrapped.isRandom) {
      // See if we should create an untracked node.
      // (This is pushed to the stack but doesn't get added to the tree.)
      // If picking the same playout twice is unlikely, it's not worth tracking.

      this.updateOdds(branchCount);
      const willReturnProbability = this.tree.playoutsLeft /
        (1 + this.notTakenOdds);
      if (willReturnProbability < 0.5) {
        return new Node(req, false, branchCount);
      }
    }

    // Add a tracked node to the tree.
    node = new Node(req, true, branchCount);
    parent.setBranch(parentPick, node);
    return node;
  }

  maybePick(req: PickRequest): number {
    const node = this.nextNode(req);
    const depth = this.depth;
    const firstChoice = this.wrapped.pick(req);
    const pick = node.filterPick(firstChoice, this.filter, depth);
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }
    this.getNodes().push(node);
    this.picks.push(pick);
    return pick;
  }

  /**
   * Returns true if there is a playout to try at the given depth. Otherwise,
   * the caller should backtrack more.
   */
  backTo(depth: number): boolean {
    const playoutDepth = this.depth;
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
    const picks = this.picks;
    while (nodes.length > depth + 1) {
      nodes.pop();
      picks.pop();
    }
    this.tree.endPlayout(playoutDepth);
    this.recalculateOdds();
    return true;
  }
}

function makeStartRequest(): PickRequest {
  // A dummy request with one branch is needed for the root, even though
  // requests normally require two branches.
  const start = {
    min: 0,
    max: 0,
    bias: uniformBias(0, 0),
    size: 1,
    default: 0,
    range: [0, 0],
    inRange: (n: number) => n === 0,
    withDefault: (_n: number) => start,
  };
  return start;
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
  private start: Node | undefined = new Node(makeStartRequest(), true, 1);

  #pickerCount = 0;
  #longestPlayout = 0;

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
      endPlayout: (depth: number) => {
        if (playoutsLeft > 0) {
          playoutsLeft--;
        }
        if (depth > this.#longestPlayout) {
          this.#longestPlayout = depth;
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

  /** The length of the longest playout.*/
  get longestPlayout(): number {
    return this.#longestPlayout;
  }

  get searchDone(): boolean {
    return this.start === undefined;
  }

  pickers(
    wrapped: IntPicker,
    opts?: SearchOpts,
  ): IterableIterator<RetryPicker> {
    const pickers: IterableIterator<RetryPicker> = {
      [Symbol.iterator]() {
        return pickers;
      },
      next: (): IteratorResult<RetryPicker, void> => {
        const value = this.makePicker(wrapped, opts);
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

  makePicker(wrapped: IntPicker, opts?: SearchOpts): Cursor | undefined {
    if (this.cursor) {
      if (!this.searchDone) {
        this.cursor.backTo(0);
      }
      this.cursor = undefined;
    }

    const start = this.start;
    if (start === undefined) return undefined;

    const version = ++this.#pickerCount;

    this.cursor = new Cursor(this.callbacks, wrapped, version, start, opts);
    return this.cursor;
  }
}

/**
 * Generates every possible playout in depth-first order.
 *
 * The caller defines the search tree by calling the {@link RetryPicker.maybePick}
 * function. Each pick determins the number of branches at a node. For example,
 * the first pick in each playout is always the root. The first call to pick
 * should always be the same (there is only one root), and subsequent picks
 * should only depend on the reply to the previous pick request.
 *
 * The next playout can be started either by calling {@link RetryPicker.backTo}
 * (if successful) or by taking the next value from the iterator.
 */
export function depthFirstSearch(): Iterable<RetryPicker> {
  return new SearchTree(0).pickers(alwaysPickDefault);
}
