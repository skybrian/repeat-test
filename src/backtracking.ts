import type { IntPicker, PickRequest, Range } from "./picks.ts";
import type { PickFunctionSource } from "./build.ts";

import { assert } from "@std/assert";
import { alwaysPickMin } from "./picks.ts";

/**
 * Generates pick sequences, avoiding duplicates.
 */
export interface Tracker {
  /**
   * Starts a playout at the given depth.
   *
   * If depth > 0, it should be less than or equal to the value returned by the
   * last call to {@link nextPlayout}.
   */
  startPlayout(depth: number): void;

  /**
   * Returns the next pick, or undefined if it's filtered by the tracker.
   */
  maybePick(req: PickRequest): number | undefined;

  /**
   * Returns the current pick sequence.
   */
  getReplies(start?: number): number[];

  /**
   * Finishes the current pick sequence and moves to the next one.
   * Returns the new depth or undefined if there are no more playouts.
   */
  nextPlayout(): number | undefined;
}

/**
 * A picker that can back up to a previous point in a playout and try a
 * different path.
 */
export class PlayoutSource implements PickFunctionSource {
  #state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";
  #depth = 0;
  readonly #reqs: Range[] = [];

  constructor(private readonly tracker: Tracker) {}

  get state(): "ready" | "picking" | "playoutDone" | "searchDone" {
    return this.#state;
  }

  /** Returns true if no more playouts are available and the search is done. */
  get done(): boolean {
    return this.state === "searchDone";
  }

  /**
   * Starts a new playout, possibly by backtracking.
   *
   * It implicitly cancels any playout in progress.
   *
   * If it returns false, there's no next playout at the given depth, and the
   * caller should try again with a lower depth.
   *
   * If `startAt(0)` returns false, there are no more playouts and the search is
   * over.
   */
  startAt(depth: number): boolean {
    // console.log("startAt", depth);
    if (this.#state === "picking") {
      this.nextPlayout();
    }
    return this.startPlayout(depth);
  }

  /**
   * Starts a new value at the given depth.
   *
   * The depth must be between 0 and the current depth.
   *
   * If currently picking and the depth matches the current depth, does nothing
   * (continuing the current playout). Otherwise, starts a new playout.
   *
   * Returns false if there are no more playouts at the given depth.
   */
  startValue(depth: number): boolean {
    if (this.#state === "picking") {
      assert(depth === this.#depth);
      return true;
    }
    return this.startPlayout(depth);
  }

  /**
   * Picks an integer within the range of the given request.
   *
   * If successful, the pick is recorded and the depth is incremented.
   *
   * Returns undefined if the current playout is cancelled.
   */
  nextPick(req: PickRequest): number | undefined {
    assert(this.state === "picking", "nextPick called in the wrong state");

    const result = this.tracker.maybePick(req);
    if (result === undefined) {
      this.nextPlayout();
      return undefined;
    }

    const last = this.#depth++;
    this.#reqs[last] = req;
    return result;
  }

  /**
   * Ends a playout.
   *
   * Returns either the picks for the finished playout or @{link Pruned} if the
   * search filtered it out.
   *
   * It's an error to call {@link nextPick} after finishing the playout.
   */
  endPlayout(): void {
    assert(this.#state === "picking", "endPlayout called in the wrong state");
    this.nextPlayout();
  }

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number {
    return this.#depth;
  }

  /**
   * Returns a slice of the pick requests made so far.
   *
   * Available only between {@link startAt} and {@link endPlayout}.
   */
  getRequests(start?: number): Range[] {
    start = start ?? 0;
    if (this.state !== "picking") {
      throw new Error(
        `getPicks called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    return this.#reqs.slice(start, this.#depth); // trailing reqs are garbage
  }

  getReplies(start?: number): number[] {
    start = start ?? 0;
    return this.tracker.getReplies(start);
  }

  private startPlayout(depth: number): boolean {
    if (this.#state === "searchDone" || depth > this.depth) {
      return false;
    }
    this.tracker.startPlayout(depth);
    this.#depth = depth;
    this.#state = "picking";
    return true;
  }

  private nextPlayout() {
    const newDepth = this.tracker.nextPlayout();
    if (newDepth === undefined) {
      this.#state = "searchDone";
      this.#depth = 0;
    } else {
      this.#state = "playoutDone";
      this.#depth = newDepth;
    }
  }
}

/**
 * A tracker that only generates one playout.
 */
class SinglePlayoutTracker implements Tracker {
  private started = false;
  private replies: number[] = [];

  constructor(private picker: IntPicker) {}

  getReplies(start?: number): number[] {
    return this.replies.slice(start);
  }

  startPlayout(depth: number): void {
    assert(depth === 0, "SinglePlayoutTracker only supports depth 0");
    assert(!this.started, "startPlayout called twice");
    this.started = true;
  }

  maybePick(req: PickRequest): number {
    const pick = this.picker.pick(req);
    this.replies.push(pick);
    return pick;
  }

  nextPlayout() {
    return undefined;
  }
}

/**
 * A source that only generates one playout.
 */
export function onePlayout(picker: IntPicker): PlayoutSource {
  return new PlayoutSource(new SinglePlayoutTracker(picker));
}

/** A source of a single playout that always picks the minimum */
export function minPlayout(): PlayoutSource {
  return new PlayoutSource(new SinglePlayoutTracker(alwaysPickMin));
}
