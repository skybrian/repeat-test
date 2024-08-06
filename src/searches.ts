import { Success, success } from "./results.ts";
import { alwaysPickMin, IntPicker, PickList, PickRequest } from "./picks.ts";

import { PlayoutPicker, Pruned } from "./backtracking.ts";
import { assert } from "@std/assert";

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

  /** Throws an Error if the range matches the one used to create the node. */
  checkRangeMatches(req: PickRequest) {
    if (this.#reqMin !== req.min || this.#max !== req.max) {
      throw new Error(
        `pick request range doesn't match previous playout; wanted [${this.#reqMin}, ${this.#max}] but got [${req.min}, ${req.max}]`,
      );
    }
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
   * Returns the next unpruned pick. (Wraps around if firstChoice isn't the
   * minimum value.)
   */
  findUnpruned(
    firstChoice: number,
  ): number {
    assert(this.branchesLeft > 0, "no branches left");
    let pick = firstChoice;
    if (pick < this.#min) pick = this.#min;
    while (true) {
      if (this[pick] !== PRUNED) {
        return pick;
      }
      pick++;
      if (pick > this.#max) pick = this.#min;
    }
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

  walk(): Walk {
    return new Walk(this.startNode, this.startPick);
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
    const walk = this.walk();
    if (!walk.pushAll(picks)) {
      return false; // already pruned
    }
    return walk.prune();
  }

  /**
   * Returns true if the pick sequence hasn't been pruned yet.
   */
  available(picks: number[]): boolean {
    const walk = this.walk();
    return walk.follow(picks) !== 0;
  }

  /**
   * Returns the number of unpruned branches left at the given node if it
   * exists. If the node or any ancestor is pruned, returns 0. For unknown
   * nodes, returns undefined.
   */
  branchesLeft(picks: number[]): number | undefined {
    const walk = this.walk();
    return walk.follow(picks);
  }

  /**
   * Returns true if every playout was pruned.
   */
  get done(): boolean {
    return this.startNode.branchesLeft === 0;
  }
}

/**
 * Points to a branch in a PickTree.
 */
export class Walk {
  private readonly nodePath: Node[];
  private readonly pickPath: number[];

  constructor(start: Node, startPick: number) {
    this.nodePath = [start];
    this.pickPath = [startPick];
  }

  private get parent(): Node {
    return this.nodePath[this.nodePath.length - 1];
  }

  get depth(): number {
    return this.nodePath.length - 1;
  }

  /** Returns the picks leading to the current branch. */
  getPicks(start?: number, end?: number): number[] {
    start = start ?? 0;
    assert(start >= 0);
    end = end ?? this.depth;
    assert(end >= start);
    return this.pickPath.slice(start + 1, end + 1);
  }

  /** Returns the pick that led to the current branch */
  get lastPick(): number {
    return this.pickPath[this.pickPath.length - 1];
  }

  /** Returns true if the Walk points to a pruned branch. */
  get pruned(): boolean {
    return this.parent.getBranch(this.lastPick) === PRUNED;
  }

  /**
   * Attempts to extend the path to an existing node. Returns the number of branches left,
   * 0 if it's pruned, or undefined if it's not created yet.
   */
  follow(picks: number[]): number | undefined {
    let parent = this.parent;
    let parentPick = this.lastPick;
    for (let i = 0; i < picks.length; i++) {
      const branch = parent.getBranch(parentPick);
      if (branch === PRUNED) {
        return 0;
      } else if (branch === undefined) {
        return undefined;
      }
      parent = branch;
      parentPick = picks[i];
      this.nodePath.push(parent);
      this.pickPath.push(parentPick);
    }

    const branch = parent.getBranch(parentPick);
    if (branch === undefined) {
      return undefined;
    } else if (branch === PRUNED) {
      return 0;
    } else {
      return branch.branchesLeft;
    }
  }

  /**
   * Attempts to extend the path to a new branch, creating nodes if needed.
   *
   * Throws an Error if a request's range doesn't match a previous playout.
   */
  pushAll(path: PickList): boolean {
    const reqs = path.reqs();
    const replies = path.replies();
    for (let i = 0; i < reqs.length; i++) {
      if (!this.push(reqs[i], replies[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Attempts to follow a branch, creating a node if needed.
   *
   * Throws an Error if a request's range doesn't match a previous playout.
   */
  push(req: PickRequest, pick: number): boolean {
    let last = this.parent.getBranch(this.lastPick);
    if (last === PRUNED) {
      return false;
    } else if (last === undefined) {
      // unexplored; add node
      last = this.parent.addChild(this.lastPick, req);
      this.nodePath.push(last);
      this.pickPath.push(pick);
      return true;
    } else {
      // revisit node
      last.checkRangeMatches(req);
      this.nodePath.push(last);
      this.pickPath.push(pick);
      return true;
    }
  }

  /**
   * Creates a node if needed and follows the first branch that's not pruned.
   *
   * Starts with firstChoice and wraps around if necessary.
   *
   * Preconditions: the Walk doesn't point at a pruned branch.
   * If the node exists, it has at least one unpruned branch.
   */
  pushUnpruned(firstChoice: number, req: PickRequest): number {
    const parent = this.parent;
    const lastPick = this.lastPick;
    let branch = parent.getBranch(lastPick);
    assert(branch !== PRUNED, "parent picked a pruned branch");
    if (branch === undefined) {
      branch = parent.addChild(lastPick, req);
    } else {
      branch.checkRangeMatches(req);
    }

    const pick = branch.findUnpruned(firstChoice);
    this.nodePath.push(branch);
    this.pickPath.push(pick);
    return pick;
  }

  /**
   * Prunes this playout and any ancestors that are now empty.
   *
   * Unless the entire tree is pruned, also removes the last non-empty node, so
   * that the Walk doesn't point at a pruned branch.
   */
  prune(): boolean {
    let parent = this.parent;
    if (!parent.prune(this.lastPick)) {
      return false; // already pruned
    }

    // remove ancestors that are now empty
    while (parent.branchesLeft === 0) {
      if (this.depth === 0) {
        // we pruned the entire tree
        return true;
      }
      this.nodePath.length -= 1;
      this.pickPath.length -= 1;
      parent = this.parent;
      parent.prune(this.lastPick);
    }

    if (this.depth > 0) {
      // Still pointing at a pruned node.
      // Pop this node so that we pick again.
      this.nodePath.length -= 1;
      this.pickPath.length -= 1;
    }
    return true;
  }

  trim(depth: number) {
    assert(depth >= 0);
    assert(depth <= this.depth);
    this.nodePath.length = depth + 1;
    this.pickPath.length = depth + 1;
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

  readonly tree: PickTree = new PickTree();
  private readonly walk = this.tree.walk();
  private readonly reqs: PickRequest[] = [];
  #trimmedDepth = 0;

  private pickSource: IntPicker = alwaysPickMin;

  private replaceRequest: RequestFilter = (_parent, req) => req;
  private acceptPlayout: PlayoutFilter = () => true;

  constructor() {}

  setOptions(opts: SearchOpts) {
    assert(
      this.state === "ready" || this.state === "playoutDone",
      "setOptions called in the wrong state",
    );
    this.pickSource = opts.pickSource ?? this.pickSource;
    this.replaceRequest = opts.replaceRequest ?? this.replaceRequest;
    this.acceptPlayout = opts.acceptPlayout ?? this.acceptPlayout;
    this.walk.trim(0);
    this.reqs.length = 0;
    this.#trimmedDepth = 0;
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

  private recalculateTrimmedDepth() {
    const picks = this.walk.getPicks();
    while (
      picks.length > 0 && picks.at(-1) === this.reqs[picks.length - 1].min
    ) {
      picks.pop();
    }
    this.#trimmedDepth = picks.length;
  }

  private removePlayout() {
    this.walk.prune();
    this.reqs.length = this.walk.depth;
    this.recalculateTrimmedDepth();
    this.state = this.walk.pruned ? "searchDone" : "playoutDone";
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
    } else if (depth > this.depth) {
      return false;
    }
    this.walk.trim(depth);
    this.reqs.length = depth;
    this.recalculateTrimmedDepth();
    this.state = "picking";
    return true;
  }

  maybePick(req: PickRequest): Success<number> | Pruned {
    assert(this.state === "picking", "maybePick called in the wrong state");

    const replaced = this.replaceRequest(this.depth, req);
    if (replaced === undefined) {
      this.removePlayout();
      return new Pruned("filtered by replaceRequest");
    }

    const firstChoice = this.pickSource.pick(replaced);
    const pick = this.walk.pushUnpruned(firstChoice, replaced);
    this.reqs.push(req);
    if (pick > req.min) {
      this.#trimmedDepth = this.reqs.length;
    }
    return success(pick);
  }

  endPlayout(): boolean {
    assert(this.state === "picking", "finishPlayout called in the wrong state");
    const accepted = this.acceptPlayout(this.walk.depth);
    this.removePlayout();
    return accepted;
  }

  get depth(): number {
    return this.walk.depth;
  }

  get trimmedDepth(): number {
    return this.#trimmedDepth;
  }

  getPicks(start?: number, end?: number): PickList {
    assert(this.state === "picking", "getPicks called in the wrong state");
    start = start ?? 0;
    assert(start >= 0);
    end = end ?? this.walk.depth;
    assert(end >= start);
    return new PickList(
      this.reqs.slice(start, end),
      this.walk.getPicks(start, end),
    );
  }
}

/**
 * Configures a search to run a breadth-first pass.
 * @param passIdx the number of previous passes that were run.
 * @param more called if more passes are needed.
 */
export function configureBreadthFirstPass(
  search: PlayoutSearch,
  passIdx: number,
  more: () => void,
) {
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

  const acceptPlayout = (depth: number) => {
    if (depth === 0) {
      return passIdx === 0;
    }
    return depth >= passIdx;
  };

  search.setOptions({
    replaceRequest,
    acceptPlayout,
  });
}

/**
 * Iterates over all playouts in breadth-first order, using iterative deepening.
 *
 * (The iterable can only be iterated over once.)
 *
 * Note: to avoid duplicate playouts, the return value of
 * {@link PlayoutPicker.endPlayout} must be used to filter them.
 */
export function* breadthFirstSearch(): Iterable<PlayoutPicker> {
  let maxDepth = 0;
  let pruned = true;
  while (pruned) {
    pruned = false;
    const search = new PlayoutSearch();
    configureBreadthFirstPass(search, maxDepth, () => {
      pruned = true;
    });
    while (!search.done) {
      yield search;
      assert(!search.picking);
    }
    maxDepth++;
  }
}
