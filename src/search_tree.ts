import { alwaysPickMin, IntPicker, PickRequest } from "./picks.ts";

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

  #reqMin: number;
  #min: number;
  #max: number;

  #tracked: boolean;
  #branchesLeft: number;

  static untracked(req: PickRequest): Node {
    return new Node(req.min, req.max, false, req.size);
  }

  static tracked(req: PickRequest): Node {
    return new Node(req.min, req.max, true, req.size);
  }

  private constructor(
    min: number,
    max: number,
    track: boolean,
    branchCount: number,
  ) {
    this.#reqMin = min;
    this.#min = min;
    this.#max = max;
    this.#tracked = track;
    this.#branchesLeft = branchCount;
  }

  check(req: PickRequest): boolean {
    return this.#reqMin === req.min && this.#max === req.max;
  }

  get tracked(): boolean {
    return this.#tracked;
  }

  getBranch(pick: number): Branch {
    if (pick < this.#min || pick > this.#max) return PRUNED;
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
    const size = this.#max - this.#min + 1;
    for (let i = 0; i < size; i++) {
      if (this[pick] !== PRUNED) {
        return pick;
      }
      pick++;
      if (pick > this.#max) pick = this.#min;
    }
    return undefined;
  }

  prune(pick: number): boolean {
    if (pick === this.#min && pick < this.#max) {
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

type RequestFilter = (
  depth: number,
  req: PickRequest,
) => PickRequest | undefined;

type PlayoutFilter = (depth: number, req: PickRequest) => boolean;

export type SearchOpts = {
  /**
   * Replaces each incoming pick request with a new one. The new request might
   * have a narrower range. If the callback returns undefined, the playout will
   * be cancelled.
   */
  replaceRequest?: RequestFilter;
  acceptPlayout?: PlayoutFilter;
  acceptEmptyPlayout?: boolean;
};

export class Cursor implements RetryPicker {
  /* Invariant: `nodes.length === reqs.length === picks.length` */

  /**
   * The nodes used in the current playout. The 'start' node is at index 0, and
   * it points to the root at index 1.
   */
  private readonly nodes: Node[];

  private readonly originalReqs: PickRequest[];
  private readonly modifiedReqs: PickRequest[];

  /**
   * The picks made in the current playout. The pick at index 0 is always 0,
   * pointing to the root node.
   */
  private readonly picks: number[];

  private readonly replaceRequest: RequestFilter;
  private readonly acceptPlayout: PlayoutFilter;
  private readonly acceptEmptyPlayout: boolean;

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
    this.originalReqs = [new PickRequest(0, 0)];
    this.modifiedReqs = [new PickRequest(0, 0)];
    this.picks = [0];
    this.replaceRequest = opts.replaceRequest ?? ((_, req) => req);
    this.acceptPlayout = opts.acceptPlayout ?? (() => true);
    this.acceptEmptyPlayout = opts.acceptEmptyPlayout ?? true;
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
    const nodes = this.getNodes();
    const parent = nodes[nodes.length - 1];
    if (!parent.tracked) {
      return Node.untracked(req);
    }

    const picks = this.picks;
    const parentPick = picks[picks.length - 1];
    let node = parent.getBranch(parentPick);

    if (node === PRUNED) {
      throw new Error("internal error: parent picked a pruned branch");
    } else if (node !== undefined) {
      // Visit existing node.
      if (!node.check(req)) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      this.updateOdds(node.branchesLeft);
      return node;
    }

    if (this.wrapped.isRandom) {
      // See if we should create an untracked node.
      // (This is pushed to the stack but doesn't get added to the tree.)
      // If picking the same playout twice is unlikely, it's not worth tracking.

      this.updateOdds(req.size);
      const willReturnProbability = this.tree.playoutsLeft /
        (1 + this.notTakenOdds);
      if (willReturnProbability < 0.5) {
        return Node.untracked(req);
      }
    }

    node = Node.tracked(req);
    parent.setBranch(parentPick, node);
    return node;
  }

  maybePick(req: PickRequest): number {
    if (this.done) throw new Error("cannot pick after finishPlayout");

    const modified = this.replaceRequest(this.depth, req);
    if (!modified) {
      throw new PlayoutPruned("pruned by replaceRequest");
    }

    const node = this.nextNode(modified);
    const firstChoice = this.wrapped.pick(modified);
    const pick = node.filterPick(firstChoice);
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }
    this.getNodes().push(node);
    this.originalReqs.push(req);
    this.modifiedReqs.push(modified);
    this.picks.push(pick);
    return pick;
  }

  finishPlayout(): boolean {
    this.tree.checkAlive(this.version);
    this.done = true;
    this.tree.endPlayout();
    if (this.depth === 0) {
      return this.acceptEmptyPlayout;
    }
    const lastReq = this.modifiedReqs[this.modifiedReqs.length - 1];
    const lastDepth = this.modifiedReqs.length - 2;
    return this.acceptPlayout(lastDepth, lastReq);
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
    nodes.splice(depth + 1);
    this.originalReqs.splice(depth + 1);
    this.modifiedReqs.splice(depth + 1);
    this.picks.splice(depth + 1);
    if (!this.done) {
      this.tree.endPlayout();
    }
    this.recalculateOdds();
    return true;
  }

  get depth(): number {
    return this.getNodes().length - 1;
  }

  getRequests(): PickRequest[] {
    return this.originalReqs.slice(1);
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
  private start: Node | undefined = Node.tracked(new PickRequest(0, 0));

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
  return new SearchTree(0).pickers(alwaysPickMin, opts);
}

/**
 * Runs a single pass of a breadth-first search.
 * @param passIdx the number of previous passes that were run.
 * @param more called if more passes are needed.
 */
export function* breadthFirstPass(
  passIdx: number,
  more: () => void,
): Iterable<RetryPicker> {
  let moreSent = false;
  function pruned() {
    if (!moreSent) {
      more();
      moreSent = true;
    }
  }
  const replaceRequest = (depth: number, req: PickRequest) => {
    if (depth === passIdx - 1) {
      pruned();
      if (req.min === req.max) {
        return undefined; //  no more playouts
      }
      return new PickRequest(req.min + 1, req.max);
    } else if (depth >= passIdx) {
      pruned();
      return new PickRequest(req.min, req.min);
    }
    return req;
  };

  const acceptPlayout = (lastDepth: number, _req: PickRequest) => {
    return lastDepth >= passIdx - 1;
  };

  const tree = new SearchTree(0);
  while (true) {
    const picker = tree.makePicker(alwaysPickMin, {
      replaceRequest,
      acceptPlayout,
      acceptEmptyPlayout: passIdx === 0,
    });
    if (picker === undefined) break;
    yield picker;
  }
}

/**
 * Iterates over all playouts in breadth-first order, using iterative deepening.
 *
 * (The iterable can only be iterated over once.)
 *
 * Note: to avoid duplicate playouts, the return value of
 * {@link RetryPicker.finishPlayout} must be used to filter them.
 */
export function* breadthFirstSearch(): Iterable<RetryPicker> {
  let maxDepth = 0;
  let pruned = true;
  while (pruned) {
    pruned = false;
    yield* breadthFirstPass(maxDepth, () => {
      pruned = true;
    });
    maxDepth++;
  }
}
