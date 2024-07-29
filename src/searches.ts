import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickList, PickRequest } from "./picks.ts";

import { PlayoutPicker, Pruned } from "./backtracking.ts";

/** Indicates that the subtree rooted at a branch has been fully explored. */
export const PRUNED = Symbol("pruned");

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
export class Node {
  [key: number]: Branch;

  #reqMin: number;
  #min: number;
  #max: number;

  #branchesLeft: number;

  /** A dummy node for pointing to the root of a tree. */
  static makeStart(): Node {
    return new Node(0, 0);
  }

  static from(req: PickRequest): Node {
    return new Node(req.min, req.max);
  }

  private constructor(
    min: number,
    max: number,
  ) {
    this.#reqMin = min;
    this.#min = min;
    this.#max = max;
    this.#branchesLeft = max - min + 1;
  }

  /** Returns true if the range matches the one used to create the node. */
  checkRange(req: PickRequest): boolean {
    return this.#reqMin === req.min && this.#max === req.max;
  }

  getBranch(pick: number): Branch {
    if (pick < this.#min || pick > this.#max) return PRUNED;
    return this[pick];
  }

  addChild(pick: number, req: PickRequest): Node {
    const node = Node.from(req);
    this[pick] = node;
    return node;
  }

  /** The number of unpruned branches. */
  get branchesLeft(): number {
    return this.#branchesLeft;
  }

  /**
   * Returns the next unpruned pick, or undefined if they are all pruned. (Wraps
   * around if firstChoice isn't the minimum value.)
   */
  findUnpruned(
    firstChoice: number,
  ): number | undefined {
    let pick = firstChoice;
    if (pick < this.#min) pick = this.#min;
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

  /**
   * Sets the branch at the given pick to pruned.
   *
   * Returns true if the pick was pruned by this call. (That is, it wasn't
   * previously pruned.)
   */
  prune(pick: number): boolean {
    if (pick === this.#min && pick < this.#max) {
      // Prune by increasing #min.
      this.#branchesLeft--;
      delete this[pick];
      this.#min++;
      // Consolidate with previous prunes. This preserves the invariant that
      // #min isn't pruned unless it's the only branch.
      while (this.#min < this.#max && this[this.#min] === PRUNED) {
        delete this[this.#min];
        this.#min++;
      }
      return true;
    } else if (pick < this.#min || pick > this.#max) {
      return false;
    } else if (this[pick] === PRUNED) {
      return false;
    }
    this[pick] = PRUNED;
    this.#branchesLeft--;
    return true;
  }

  /**
   * Given a start node (with a single branch), returns true if the
   * branch corresponding to the given playout was pruned.
   */
  static isPrunedPlayout(start: Node, picks: number[]): boolean {
    let parent = start;
    let parentPick = 0;
    for (let i = 0; i < picks.length; i++) {
      const branch = parent.getBranch(parentPick);
      if (branch == PRUNED) {
        return true;
      } else if (branch === undefined) {
        return false; // unexplored
      }
      parent = branch;
      parentPick = picks[i];
    }
    return parent.getBranch(parentPick) === PRUNED;
  }

  /**
   * Given a start node (with a single branch), sets the branch corresponding to
   * the given pick sequence to pruned.
   *
   * Returns true if the pick was pruned by this call. (That is, it wasn't
   * previously pruned.)
   */
  static prunePlayout(start: Node, picks: PickList): boolean {
    const reqs = picks.reqs();
    const replies = picks.replies();

    let parent = start;
    let parentPick = 0;

    const nodePath: Node[] = [];
    const pickPath: number[] = [];

    // walk the tree, adding nodes where needed.
    for (let i = 0; i < reqs.length; i++) {
      const branch = parent.getBranch(parentPick);
      if (branch == PRUNED) {
        return false; // aleady added
      }
      nodePath.push(parent);
      pickPath.push(parentPick);
      if (branch === undefined) {
        // unexplored; add node
        parent = parent.addChild(parentPick, reqs[i]);
        parentPick = replies[i];
      } else {
        parent = branch;
        parentPick = replies[i];
      }
    }

    if (!parent.prune(parentPick)) {
      return false; // already pruned
    }

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

class PickStack {
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

  /**
   * The odds that a playout other than the one we're on would have been picked
   * instead, assuming available branches were picked from a uniform
   * distribution.
   *
   * For example, if set to 0, that means there was no alternative pick. The
   * odds are 0:1, or 0%. A value of 1 means the odds are 1:1 or a 50%
   * probability.
   */
  private notTakenOdds: number | undefined;

  constructor(opts: { trackOdds: boolean }) {
    this.nodes = [Node.makeStart()];
    this.originalReqs = [new PickRequest(0, 0)];
    this.modifiedReqs = [new PickRequest(0, 0)];
    this.picks = [0];
    this.notTakenOdds = opts.trackOdds ? 0 : undefined;
  }

  get depth(): number {
    return this.nodes.length - 1;
  }

  isPruned(picks: number[]): boolean {
    return Node.isPrunedPlayout(this.nodes[0], picks);
  }

  getPicks(start?: number, end?: number): PickList {
    start = start ? start + 1 : 1;
    end = end ? end + 1 : this.picks.length;
    return new PickList(
      this.originalReqs.slice(start, end),
      this.picks.slice(start, end),
    );
  }

  nextNode(req: PickRequest, playoutsLeft: number): Node {
    const nodes = this.nodes;
    const parent = nodes[nodes.length - 1];

    const picks = this.picks;
    const parentPick = picks[picks.length - 1];
    const node = parent.getBranch(parentPick);

    if (node === PRUNED) {
      throw new Error("internal error: parent picked a pruned branch");
    } else if (node !== undefined) {
      // Visit existing node.
      if (!node.checkRange(req)) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      this.updateOdds(node.branchesLeft);
      return node;
    }

    if (this.notTakenOdds !== undefined) {
      // See if we should create an untracked node.
      // (This is pushed to the stack but doesn't get added to the tree.)
      // If picking the same playout twice is unlikely, it's not worth tracking.

      this.updateOdds(req.size);
      const willReturnProbability = playoutsLeft /
        (1 + this.notTakenOdds);
      if (willReturnProbability < 0.5) {
        // It's not added to the parent, so it's effectively untracked.
        // (The node will be forgotten when popping the stack.)
        return Node.from(req);
      }
    }

    return parent.addChild(parentPick, req);
  }

  push(n: Node, req: PickRequest, modified: PickRequest, pick: number): void {
    this.nodes.push(n);
    this.originalReqs.push(req);
    this.modifiedReqs.push(modified);
    this.picks.push(pick);
  }

  /**
   * Prunes the current playout and any ancestors that have only one branch left.
   * Returns true if more playouts are available.
   */
  prune(): boolean {
    const nodes = this.nodes;
    const picks = this.picks;
    // Prune at the last node with more than one branch.
    for (let i = nodes.length - 1; i > 0; i--) {
      const n = nodes[i];
      if (n.branchesLeft > 1) {
        n.prune(picks[i]);
        // Remove this node from the stack so we take a different branch.
        this.trim(i - 1);
        return true;
      }
    }
    // No branches. Prune the last playout of the search.
    nodes[0].prune(picks[0]);
    return false;
  }

  trim(depth: number): boolean {
    if (depth < 0) {
      throw new Error("depth must be >= 0");
    } else if (depth + 1 > this.nodes.length) {
      return false;
    } else if (depth + 1 === this.nodes.length) {
      return true;
    }
    this.nodes.length = depth + 1;
    this.originalReqs.length = depth + 1;
    this.modifiedReqs.length = depth + 1;
    this.picks.length = depth + 1;
    this.recalculateOdds();
    return true;
  }

  recalculateOdds(track?: boolean) {
    if (track ?? this.notTakenOdds !== undefined) {
      this.notTakenOdds = 0;
      for (const node of this.nodes) {
        this.updateOdds(node.branchesLeft);
      }
    } else {
      this.notTakenOdds = undefined;
    }
  }

  /**
   * Recomputes the odds after taking a branch.
   * @param branchCount the number of branches that could have been taken.
   */
  private updateOdds(branchCount: number) {
    if (this.notTakenOdds === undefined) return;

    if (branchCount < 1) {
      throw new Error("branchCount must be at least 1");
    }
    this.notTakenOdds = this.notTakenOdds * branchCount + (branchCount - 1);
  }
}

type RequestFilter = (
  depth: number,
  req: PickRequest,
) => PickRequest | undefined;

type PlayoutFilter = (depth: number) => boolean;

export type SearchOpts = {
  /**
   * Used when deciding which branch to take in the search tree.
   *
   * Note that sometimes the picked branch has been pruned, in which case a
   * different pick will be used.
   */
  pickSource?: IntPicker;

  /**
   * Used to decide whether track nodes when the pickSource is random.
   */
  expectedPlayouts?: number;

  /**
   * Replaces each incoming pick request with a new one. The new request might
   * have a narrower range. If the callback returns undefined, the playout will
   * be cancelled.
   */
  replaceRequest?: RequestFilter;
  acceptPlayout?: PlayoutFilter;
  acceptEmptyPlayout?: boolean;
};

/**
 * A search over all possible pick sequences (playouts).
 *
 * It avoids duplicate playouts by recording each pick in a search tree. For
 * small search trees where every pick is recorded, eventually every playout
 * will be eliminated and the search will end.
 *
 * The default search is depth-first, but it can also be configured to pick
 * randomly using {@link SearchOpts.pickSource}. For a breadth-first search, see
 * {@link breadthFirstSearch}.
 *
 * Duplicates may happen with small probability when doing a random search,
 * because visits to nodes with many branches won't be tracked.  The heuristic
 * depends on the {@link SearchOpts.expectedPlayouts} setting, which can be
 * increased to do more tracking during a large search.
 */
export class PlayoutSearch implements PlayoutPicker {
  private state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";
  private readonly stack;
  private playoutsLeft = 1000;

  private pickSource: IntPicker = alwaysPickMin;

  private replaceRequest: RequestFilter = (_parent, req) => req;
  private acceptPlayout: PlayoutFilter = () => true;
  private acceptEmptyPlayout = true;

  constructor(opts?: SearchOpts) {
    this.stack = new PickStack({ trackOdds: this.pickSource.isRandom });
    if (opts) this.setOptions(opts);
  }

  setOptions(opts: SearchOpts): boolean {
    if (this.state === "searchDone") {
      return false;
    }
    this.pickSource = opts.pickSource ?? this.pickSource;
    this.playoutsLeft = opts.expectedPlayouts ?? this.playoutsLeft;
    this.stack.recalculateOdds(this.pickSource.isRandom);
    this.replaceRequest = opts.replaceRequest ?? this.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout ?? this.acceptPlayout;
    this.acceptEmptyPlayout = opts.acceptEmptyPlayout ??
      this.acceptEmptyPlayout;
    return true;
  }

  /** Returns true if a playout is in progress. */
  get picking() {
    return this.state === "picking";
  }

  /** Returns true if no more playouts are available and the search is done. */
  get done() {
    return this.state === "searchDone";
  }

  private removePlayout() {
    if (this.stack.prune()) {
      this.state = "playoutDone";
      if (this.playoutsLeft > 0) {
        this.playoutsLeft--;
      }
    } else {
      this.state = "searchDone";
    }
  }

  /**
   * Removes any picks from the stack so that only startAt(0) will work.
   */
  clearPicks() {
    if (this.state === "picking") {
      this.removePlayout();
    }
    this.stack.trim(0);
  }

  /**
   * Returns true if the pick sequence was pruned due to previously being
   * visited.
   */
  isPruned(picks: number[]): boolean {
    return this.stack.isPruned(picks);
  }

  startAt(depth: number): boolean {
    if (this.state === "searchDone") {
      return false;
    }
    if (this.state === "ready") {
      this.state = "picking";
      return true;
    } else if (this.state === "picking") {
      this.removePlayout(); // should change state
    }
    if (this.state !== "playoutDone") {
      return false;
    }
    if (!this.stack.trim(depth)) {
      return false;
    }
    this.state = "picking";
    return true;
  }

  maybePick(req: PickRequest): Success<number> | Pruned {
    if (this.state !== "picking") {
      throw new Error(
        `maybePick called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }

    const modified = this.replaceRequest(this.depth, req);
    if (modified === undefined) {
      this.removePlayout();
      return new Pruned("filtered by replaceRequest");
    }

    const node = this.stack.nextNode(modified, this.playoutsLeft);
    const firstChoice = this.pickSource.pick(modified);
    const pick = node.findUnpruned(firstChoice);
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }
    this.stack.push(node, req, modified, pick);
    return success(pick);
  }

  finishPlayout(): boolean {
    if (this.state !== "picking") {
      throw new Error(
        `finishPlayout called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    let accepted = false;
    if (this.stack.depth === 0) {
      accepted = this.acceptEmptyPlayout;
    } else {
      const lastDepth = this.stack.depth - 1;
      accepted = this.acceptPlayout(lastDepth);
    }

    this.removePlayout();
    return accepted;
  }

  get depth(): number {
    return this.stack.depth;
  }

  getPicks(start?: number, end?: number): PickList {
    if (this.state !== "picking") {
      throw new Error(
        `getPicks called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    return this.stack.getPicks(start, end);
  }
}

/**
 * Runs a single pass of a breadth-first search.
 * @param passIdx the number of previous passes that were run.
 * @param more called if more passes are needed.
 */
export function breadthFirstPass(
  passIdx: number,
  more: () => void,
): PlayoutSearch {
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

  const acceptPlayout = (lastDepth: number) => {
    return lastDepth >= passIdx - 1;
  };

  return new PlayoutSearch({
    replaceRequest,
    acceptPlayout,
    acceptEmptyPlayout: passIdx === 0,
  });
}

/**
 * Iterates over all playouts in breadth-first order, using iterative deepening.
 *
 * (The iterable can only be iterated over once.)
 *
 * Note: to avoid duplicate playouts, the return value of
 * {@link PlayoutPicker.finishPlayout} must be used to filter them.
 */
export function* breadthFirstSearch(): Iterable<PlayoutPicker> {
  let maxDepth = 0;
  let pruned = true;
  while (pruned) {
    pruned = false;
    const search = breadthFirstPass(maxDepth, () => {
      pruned = true;
    });
    while (!search.done) {
      yield search;
      if (search.picking) {
        search.finishPlayout();
        search.clearPicks();
      }
    }
    maxDepth++;
  }
}
