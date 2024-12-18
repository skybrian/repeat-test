import type { Pushable, RandomSource, Range } from "./picks.ts";

import { assert } from "@std/assert";
import { IntRequest } from "./picks.ts";

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
 * A search tree node corresponding to one {@link IntRequest} in a playout.
 *
 * It has a branch for each possible pick in the IntRequest's range. When all
 * possibilities have been exhausted for a pick, it can be set to {@link PRUNED}
 * to avoid needlessly visiting it again.
 */
class Node {
  [key: number]: Branch;

  /** Invariant: #reqMin <= #min <= #max */
  /** Invariant: this[#min] was not pruned unless #min === #max */

  /** The original minimum from the pick request. */
  #reqMin: number;
  /** The minimum unpruned branch. All picks less than min are considered pruned. */
  #min: number;
  /** The maximum from the pick request. */
  #max: number;

  #branchesLeft: number;

  /** The number of children that have been added to this node. */
  #children = 0;

  /** Counts the number of times a child was visited without being tracked. */
  #untrackedVisits = 0;

  /** A dummy node for pointing to the root of a tree. */
  static makeStart(): Node {
    return new Node(0, 0);
  }

  static from(req: Range): Node {
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
  checkRangeMatches(req: Range) {
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

  addChild(pick: number, req: Range): Node {
    assert(this[pick] === undefined);
    this.#children++;
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

  firstUnprunedInRange(
    min: number,
    max: number,
  ): number | undefined {
    assert(this.branchesLeft > 0, "no branches left");
    let pick = min;
    if (pick < this.#min) pick = this.#min;
    if (max > this.#max) max = this.#max;
    while (pick <= max) {
      if (this[pick] !== PRUNED) {
        return pick;
      }
      pick++;
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
      if (this.#children > 0 && this[pick] instanceof Node) {
        this.#children--;
        delete this[pick];
      }
      this.#min++;
      // Consolidate with previous prunes. This preserves the invariant that
      // #min isn't pruned unless it's the only branch.
      while (this.#min < this.#max && this[this.#min] === PRUNED) {
        delete this[this.#min];
        this.#min++;
      }
      return true; // (due to invariant)
    } else if (pick < this.#min || pick > this.#max) {
      return false;
    } else if (this[pick] === PRUNED) {
      return false;
    }
    this[pick] = PRUNED;
    this.#branchesLeft--;
    return true;
  }

  /** Prunes all branches below the given pick. */
  pruneTo(pick: number) {
    assert(pick <= this.#max);
    while (this.#min < pick) {
      this.prune(this.#min);
    }
  }

  get untrackedVisits(): number {
    return this.#untrackedVisits;
  }

  countVisit() {
    this.#untrackedVisits++;
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
   * If a previous playout had the same prefix, each pick in the prefix must
   * have the same range as before.
   *
   * Returns true if the playout was available before being pruned.
   *
   * Throws an error if a pick's range doesn't match a previous playout.
   */
  prune(playout: Pushable): boolean {
    const walk = this.walk();
    if (!playout.pushTo(walk)) {
      return false; // already pruned
    }
    return walk.prune();
  }

  /**
   * Returns true if the pick sequence hasn't been pruned yet.
   */
  available(replies: Iterable<number>): boolean {
    const walk = this.walk();
    return walk.follow(replies) !== 0;
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
  /** Invariant: nodePath.length <= pickPath.length */
  private readonly nodePath: Node[];
  private readonly pickPath: number[];
  private len: number;

  constructor(start: Node, startPick: number) {
    this.nodePath = [start];
    this.pickPath = [startPick];
    this.len = 1;
  }

  private get parent(): Node {
    return this.nodePath[this.len - 1];
  }

  get depth(): number {
    return this.len - 1;
  }

  /** Returns the picks leading to the current branch. */
  getReplies(start?: number): number[] {
    start = start ?? 0;
    return this.pickPath.slice(1 + start, this.len);
  }

  /** Returns the pick that led to the current branch */
  get lastReply(): number {
    return this.pickPath[this.len - 1];
  }

  /** Returns true if the Walk points to a pruned branch. */
  get pruned(): boolean {
    return this.parent.getBranch(this.lastReply) === PRUNED;
  }

  /**
   * Returns the number of times an untracked child was visited.
   */
  get untrackedVisits(): number {
    return this.parent.untrackedVisits;
  }

  /**
   * Finds the minimum pick that's both unpruned and in the given range.
   *
   * Returns undefined if there are no unpruned picks in the range.
   */
  firstUnprunedInRange(min: number, max: number): number | undefined {
    const branch = this.parent.getBranch(this.lastReply);
    if (branch === undefined) {
      return min; // no filtering
    } else if (branch === PRUNED) {
      return undefined; // all filtered out
    }
    return branch.firstUnprunedInRange(min, max);
  }

  /**
   * Decreases the range of a IntRequest to match the current branch.
   */
  narrow(req: IntRequest): IntRequest {
    const branch = this.parent.getBranch(this.lastReply);
    if (branch instanceof Node) {
      const min = branch.findUnpruned(0);
      if (min > req.min) {
        assert(min <= req.max);
        const bias = (source: RandomSource) => {
          const pick = req.random(source);
          return pick < min ? min : pick;
        };
        return new IntRequest(min, req.max, { bias });
      }
    }
    return req;
  }

  private pushNode(n: Node, pick: number) {
    const last = this.len++;
    this.nodePath[last] = n;
    this.pickPath[last] = pick;
  }

  /**
   * Attempts to extend the path to an existing node. Returns the number of branches left,
   * 0 if it's pruned, or undefined if it's not created yet.
   */
  follow(replies: Iterable<number>): number | undefined {
    let parent = this.parent;
    let parentPick = this.lastReply;
    for (const reply of replies) {
      const branch = parent.getBranch(parentPick);
      if (branch === PRUNED) {
        return 0;
      } else if (branch === undefined) {
        return undefined;
      }
      parent = branch;
      parentPick = reply;
      this.pushNode(parent, parentPick);
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
   * Attempts to follow a branch, creating a node if needed.
   *
   * Returns false if the *parent* was already pruned. (The node doesn't exist.)
   * The current pick isn't checked.
   *
   * Throws an Error if a request's range doesn't match a previous playout.
   */
  push(req: Range, pick: number): boolean {
    let last = this.parent.getBranch(this.lastReply);
    if (last === PRUNED) {
      return false;
    } else if (last === undefined) {
      // unexplored; add node
      last = this.parent.addChild(this.lastReply, req);
      this.pushNode(last, pick);
      return true;
    } else {
      // revisit node
      last.checkRangeMatches(req);
      this.pushNode(last, pick);
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
  pushUnpruned(
    firstChoice: number,
    req: Range,
    opts?: { track?: boolean },
  ): number {
    const parent = this.parent;
    const lastPick = this.lastReply;
    let branch = parent.getBranch(lastPick);
    assert(branch !== PRUNED, "parent picked a pruned branch");
    if (branch === undefined) {
      const track = opts?.track ?? true;
      if (track) {
        branch = parent.addChild(lastPick, req);
      } else {
        // Count this visit instead of tracking it.
        parent.countVisit();
        branch = Node.from(req);
      }
    } else {
      branch.checkRangeMatches(req);
    }

    const pick = branch.findUnpruned(firstChoice);
    this.pushNode(branch, pick);
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
    if (!parent.prune(this.lastReply)) {
      return false; // already pruned
    }

    // remove ancestors that are now empty
    while (parent.branchesLeft === 0) {
      if (this.depth === 0) {
        // we pruned the entire tree
        return true;
      }
      this.len--;
      parent = this.parent;
      parent.prune(this.lastReply);
    }

    if (this.depth > 0) {
      // Still pointing at a pruned node.
      // Pop this node so that we pick again.
      this.len--;
    }
    return true;
  }

  /** If the current branch is a Node, prune any lower picks. */
  pruneBranchTo(pick: number) {
    const branch = this.parent.getBranch(this.lastReply);
    if (branch instanceof Node) {
      branch.pruneTo(pick);
    }
  }

  trim(depth: number) {
    assert(depth >= 0);
    if (depth < this.depth) {
      this.len = depth + 1;
    }
  }
}
