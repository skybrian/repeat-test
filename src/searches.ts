import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickList, PickRequest } from "./picks.ts";

import { PlayoutPicker, Pruned } from "./backtracking.ts";

/** Indicates that the subtree rooted at a branch has been fully explored. */
export const PRUNED = Symbol("pruned");

/**
 * The state of a branch in a {@link Node}.
 *
 * An undefined branch is not being tracked (yet). Either it hasn't been
 * visited, or the probability of a duplicate is too low to be worth tracking.
 */
type Branch = undefined | Node | typeof PRUNED;

/**
 * A search tree node corresponding to one {@link PickRequest} in a playout.
 *
 * It has a branch for each possible pick in the PickRequest's range. When all
 * possibilities have been exhausted for a pick, it can be set to {@link PRUNED}
 * to avoid needlessly visiting it again.
 */
class Node {
  [key: number]: Branch;

  /** Invariant: reqMin <= min <= max */

  /** The original minimum from the pick request. */
  #reqMin: number;
  /** The minimum unpruned branch. All picks less than min are considered pruned. */
  #min: number;
  /** The maximum from the pick request. */
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
  rangeMatches(req: PickRequest): boolean {
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
   * Returns the Node at the given path, if created and not pruned.
   */
  static at(start: Node, picks: number[]): Branch {
    let parent = start;
    let parentPick = 0;
    for (let i = 0; i < picks.length; i++) {
      const branch = parent.getBranch(parentPick);
      if (branch == PRUNED || branch === undefined) {
        return branch;
      }
      parent = branch;
      parentPick = picks[i];
    }
    return parent.getBranch(parentPick);
  }
}

/**
 * A set of possible pick sequences.
 */
export class PickTree {
  private readonly startNode: Node;
  private readonly startPick: number;

  /**
   * Creates a new set containing all possible pick sequences.
   */
  constructor(startNode?: Node, startPick?: number) {
    this.startNode = startNode ?? Node.makeStart();
    this.startPick = startPick ?? 0;
  }

  /**
   * Prunes a possible playout.
   *
   * If a previous playout had the same prefix, each PickRequest in the prefix
   * is checked to ensure that it has the same range as before.
   *
   * Returns true if the playout was available before being pruned.
   *
   * Throws an error if a PickRequest's range doesn't match a previous playout.
   */
  prune(picks: PickList): boolean {
    const reqs = picks.reqs();
    const replies = picks.replies();

    let parent = this.startNode;
    let parentPick = this.startPick;

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
        if (!branch.rangeMatches(reqs[i])) {
          throw new Error("pick request range doesn't match previous playout");
        }
        parent = branch;
        parentPick = replies[i];
      }
    }

    if (!parent.prune(parentPick)) {
      return false; // already pruned
    }

    // remove ancestors that are now empty
    let child = parent;
    while (child.branchesLeft === 0) {
      const parent = nodePath.pop();
      if (parent === undefined) {
        return true; // pruned the last playout
      }
      const parentPick = pickPath.pop();
      if (parentPick === undefined) {
        throw new Error("nodePath and pickPath should be the same length");
      }
      parent.prune(parentPick);
      child = parent;
    }

    return true;
  }

  /**
   * Returns true if the pick sequence hasn't been pruned yet.
   */
  available(picks: number[]): boolean {
    return Node.at(this.startNode, picks) !== PRUNED;
  }

  branchesLeft(picks: number[]): number | undefined {
    const branch = Node.at(this.startNode, picks);
    if (branch === undefined) {
      return undefined;
    } else if (branch === PRUNED) {
      return 0;
    } else {
      return branch.branchesLeft;
    }
  }

  /**
   * Returns true if every playout was pruned.
   */
  done(): boolean {
    return this.startNode.branchesLeft === 0;
  }
}

/**
 * Holds the search tree and the current playout.
 */
class PickStack {
  /* Invariant: `nodes.length === reqs.length === picks.length` */

  /**
   * The nodes used in the current playout. The 'start' node is at index 0, and
   * it points to the root at index 1.
   */
  private readonly nodes: Node[] = [Node.makeStart()];

  readonly tree: PickTree = new PickTree(this.nodes[0]);

  private readonly reqs: PickRequest[] = [new PickRequest(0, 0)];

  /**
   * The picks made in the current playout. The pick at index 0 is always 0,
   * pointing to the root node.
   */
  private readonly picks: number[] = [0];

  constructor() {}

  /**
   * Searches for an unpruned pick and adds it to the pick sequence.
   *
   * @param original the original request, to be returned by {@link getPicks}.
   * @param narrowed the range of picks to be allowed in the search tree
   * @param firstChoice the pick that the search should start from
   *
   * Returns the new pick.
   */
  pickUnpruned(
    original: PickRequest,
    narrowed: PickRequest,
    firstChoice: number,
  ): number {
    const node = this.visitNode(narrowed);
    const pick = node.findUnpruned(firstChoice);
    if (pick === undefined) {
      throw new Error("internal error: node has no unpruned picks");
    }

    this.nodes.push(node);
    this.reqs.push(original);
    this.picks.push(pick);
    return pick;
  }

  /**
   * Returns the node corresponding to a new pick request.
   *
   * If any previous playout made the same request, it checks that the range
   * matches.
   */
  private visitNode(req: PickRequest): Node {
    const nodes = this.nodes;
    const parent = nodes[nodes.length - 1];

    const picks = this.picks;
    const parentPick = picks[picks.length - 1];
    const node = parent.getBranch(parentPick);

    if (node === PRUNED) {
      throw new Error("internal error: parent picked a pruned branch");
    } else if (node !== undefined) {
      // Visit existing node.
      if (!node.rangeMatches(req)) {
        throw new Error(
          `pick request range doesn't match a previous visit`,
        );
      }
      return node;
    }

    return parent.addChild(parentPick, req);
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
    } else if (depth > this.depth) {
      return false;
    } else if (depth === this.depth) {
      return true;
    }
    this.nodes.length = depth + 1;
    this.reqs.length = depth + 1;
    this.picks.length = depth + 1;
    return true;
  }

  get depth(): number {
    return this.nodes.length - 1;
  }

  getPicks(start?: number, end?: number): PickList {
    if (start && start < 0) throw new Error("start must be >= 0");
    if (end && end < 0) throw new Error("end must be >= 0");
    start = start ? start + 1 : 1;
    end = end ? end + 1 : this.picks.length;
    return new PickList(
      this.reqs.slice(start, end),
      this.picks.slice(start, end),
    );
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
  private readonly stack = new PickStack();

  private pickSource: IntPicker = alwaysPickMin;

  private replaceRequest: RequestFilter = (_parent, req) => req;
  private acceptPlayout: PlayoutFilter = () => true;
  private acceptEmptyPlayout = true;

  constructor(opts?: SearchOpts) {
    this.setOptions(opts ?? {});
  }

  setOptions(opts: SearchOpts) {
    if (this.state !== "ready" && this.state !== "playoutDone") {
      throw new Error(
        "setOptions called in the wrong state; wanted 'ready' or 'playoutDone', got '" +
          this.state + "'",
      );
    }
    this.pickSource = opts.pickSource ?? this.pickSource;
    this.stack.trim(0);
    this.replaceRequest = opts.replaceRequest ?? this.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout ?? this.acceptPlayout;
    this.acceptEmptyPlayout = opts.acceptEmptyPlayout ??
      this.acceptEmptyPlayout;
    return true;
  }

  /**
   * The tree that keeps track of pruned nodes for this search.
   */
  get tree(): PickTree {
    return this.stack.tree;
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

    const replaced = this.replaceRequest(this.depth, req);
    if (replaced === undefined) {
      this.removePlayout();
      return new Pruned("filtered by replaceRequest");
    }

    const firstChoice = this.pickSource.pick(replaced);
    const pick = this.stack.pickUnpruned(req, replaced, firstChoice);

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
