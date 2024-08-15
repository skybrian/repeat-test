import { assert } from "@std/assert";
import { PickList, PickRequest } from "./picks.ts";

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
    assert(depth <= this.depth, "trim depth must be <= current depth");
    this.nodePath.length = depth + 1;
    this.pickPath.length = depth + 1;
  }
}
