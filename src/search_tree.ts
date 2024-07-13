import { alwaysPickDefault, IntPicker, PickRequest } from "./picks.ts";

import { PlayoutPruned, RetryPicker } from "./backtracking.ts";

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

  #req: PickRequest;
  #min: number;

  #tracked: boolean;
  #branchesLeft: number;

  constructor(req: PickRequest, track: boolean, branchCount: number) {
    this.#req = req;
    this.#min = req.min;
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
    if (pick < this.#min || pick > this.#req.max) return PRUNED;
    if (!this.#tracked) return undefined;
    return this[pick];
  }

  setBranch(pick: number, node: Node): boolean {
    if (!this.#tracked) return false;
    this[pick] = node;
    return true;
  }

  /** The number of unpruned branches. */
  get branchesLeft(): number {
    return this.#branchesLeft;
  }

  filterPick(
    firstChoice: number,
  ): number | undefined {
    let pick = firstChoice;
    if (pick < this.#min) pick = this.#min;
    if (!this.#tracked) return pick;
    const size = this.#req.max - this.#min + 1;
    for (let i = 0; i < size; i++) {
      if (this[pick] !== PRUNED) {
        return pick;
      }
      pick++;
      if (pick > this.#req.max) pick = this.#min;
    }
    return undefined;
  }

  prune(pick: number): boolean {
    if (pick === this.#min && pick < this.#req.max) {
      this.#min++;
      this.#branchesLeft--;
      delete this[pick];
      return true;
    }
    if (!this.#tracked) {
      return false;
    } else {
      this[pick] = PRUNED;
      this.#branchesLeft--;
      return true;
    }
  }
}

interface CursorParent {
  checkAlive(version: number): void;
  get playoutsLeft(): number;
  endPlayout(): void;
  endSearch(): void;
}

export type SearchOpts = {
  /**
   * Replaces each incoming pick request with a new one. The new request might
   * have a narrower range or a different default. If the callback returns
   * undefined, the playout will be cancelled.
   */
  replaceRequest?: (req: PickRequest, depth: number) => PickRequest | undefined;
  acceptPlayout?: (depth: number) => boolean;
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

  private readonly replaceRequest: (
    req: PickRequest,
    depth: number,
  ) => PickRequest | undefined;

  private readonly acceptPlayout: (depth: number) => boolean;

  private done = false;

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
    this.replaceRequest = opts.replaceRequest ?? ((req) => req);
    this.acceptPlayout = opts.acceptPlayout ?? (() => true);
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

  private nextNode(req: PickRequest) {
    const branchCount = req.size;

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
    if (this.done) throw new Error("cannot pick after finishPlayout");

    const replacement = this.replaceRequest(req, this.depth);
    if (!replacement) {
      throw new PlayoutPruned("pruned by replaceRequest");
    }
    req = replacement;

    const node = this.nextNode(req);
    const firstChoice = this.wrapped.pick(req);
    const pick = node.filterPick(firstChoice);
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }
    this.getNodes().push(node);
    this.picks.push(pick);
    return pick;
  }

  finishPlayout(): boolean {
    this.done = true;
    this.tree.endPlayout();
    return this.acceptPlayout(this.depth);
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
    const picks = this.picks;
    while (nodes.length > depth + 1) {
      nodes.pop();
      picks.pop();
    }
    if (!this.done) {
      this.tree.endPlayout();
    }
    this.recalculateOdds();
    return true;
  }

  get depth(): number {
    return this.getNodes().length - 1;
  }

  getPicks(): number[] {
    return this.picks.slice(1);
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
  private start: Node | undefined = new Node(new PickRequest(0, 0), true, 1);

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

  /**
   * Returns a sequence of pickers, each of which will usually pick a different playout.
   *
   * (If it's iterated over more than once, it will resume where it left off.)
   */
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
export function depthFirstSearch(opts?: SearchOpts): Iterable<RetryPicker> {
  return new SearchTree(0).pickers(alwaysPickDefault, opts);
}

export type BreadthFirstSearchOpts = {
  /**
   * The depth to start the search at.
   *
   * If not set, the search starts at depth 0.
   */
  startDepth?: number;
};

/**
 * Iterates over all playouts in breadth-first order, using iterative deepening.
 *
 * (The iterable can only be iterated over once.)
 */
export function* breadthFirstSearch(
  opts?: BreadthFirstSearchOpts,
): Iterable<RetryPicker> {
  let maxDepth = opts?.startDepth ?? 0;
  let prevDepth = -1;
  let pruned = true;
  while (pruned) {
    pruned = false;

    const replaceRequest = (req: PickRequest, depth: number) => {
      if (depth > maxDepth) {
        pruned = true;
        return undefined;
      }
      return req;
    };

    const acceptPlayout = (depth: number) => {
      if (depth > maxDepth) {
        pruned = true;
        return false;
      }
      return depth > prevDepth;
    };

    const tree = new SearchTree(0);
    while (true) {
      const picker = tree.makePicker(alwaysPickDefault, {
        replaceRequest,
        acceptPlayout,
      });
      if (picker === undefined) break;
      yield picker;
    }
    prevDepth = maxDepth;
    maxDepth++;
  }
}
