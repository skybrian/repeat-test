import { assert } from "@std/assert";
import { type Success, success } from "./results.ts";
import {
  alwaysPickMin,
  type IntPicker,
  type PickRequest,
  PlaybackPicker,
} from "./picks.ts";

/**
 * Indicates that a playout didn't result in generating a value.
 *
 * This can happen due to filtering or a partial search.
 *
 * Sometimes recovery is possible by starting a new playout and picking again.
 * (See {@link PlayoutSource.startAt}.) It won't be possible when a search has
 * visited every playout.
 */
export class Pruned extends Error {
  readonly ok = false;
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * A picker that can back up to a previous point in a playout and try a
 * different path.
 */
export abstract class PlayoutSource {
  #state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";
  #depth = 0;
  readonly #reqs: PickRequest[] = [];

  get state(): "ready" | "picking" | "playoutDone" | "searchDone" {
    return this.#state;
  }

  /** Returns true if no more playouts are available and the search is done. */
  get done() {
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
      this.next();
    }
    if (this.#state === "searchDone" || depth > this.depth) {
      return false;
    }
    this.startPlayout(depth);
    this.#depth = depth;
    this.#state = "picking";
    return true;
  }

  /**
   * Picks an integer within the range of the given request.
   *
   * If successful, the pick is recorded and the depth is incremented.
   *
   * Returns {@link Pruned} if the current playout is cancelled.
   */
  nextPick(req: PickRequest): Success<number> | Pruned {
    assert(this.state === "picking", "nextPick called in the wrong state");

    const result = this.maybePick(req);
    if (result === undefined) {
      this.next();
      return new Pruned("playout cancelled in nextPick");
    }

    const last = this.#depth++;
    this.#reqs[last] = req;
    return success(result);
  }

  /**
   * Ends a playout.
   *
   * Returns either the picks for the finished playout or @{link Pruned} if the
   * search filtered it out.
   *
   * It's an error to call {@link nextPick} after finishing the playout.
   */
  endPlayout(): boolean {
    assert(this.#state === "picking", "endPlayout called in the wrong state");
    const accepted = this.acceptPlayout();
    this.next();
    return accepted;
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
  getRequests(): PickRequest[] {
    if (this.state !== "picking") {
      throw new Error(
        `getPicks called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    return this.#reqs.slice(0, this.#depth); // trailing reqs are garbage
  }

  abstract getReplies(): number[];

  protected abstract startPlayout(depth: number): void;

  protected abstract maybePick(req: PickRequest): number | undefined;

  /** Returns true if the current playout is not filtered out. */
  protected acceptPlayout(): boolean {
    return true;
  }

  /**
   * Removes the current playout. Returns the new depth or undefined if there
   * are no more playouts.
   */
  protected abstract nextPlayout(): number | undefined;

  private next() {
    const newDepth = this.nextPlayout();
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
 * A source that only generates one playout.
 */
class SinglePlayoutSource extends PlayoutSource {
  private replies: number[] = [];

  constructor(private picker: IntPicker) {
    super();
  }

  getReplies(start?: number, end?: number): number[] {
    return this.replies.slice(start, end);
  }

  protected startPlayout(_depth: number): void {
  }

  protected maybePick(req: PickRequest): number {
    const pick = this.picker.pick(req);
    this.replies.push(pick);
    return pick;
  }

  protected nextPlayout() {
    return undefined;
  }
}

/**
 * A source that only generates one playout.
 */
export function onePlayout(picker: IntPicker): PlayoutSource {
  return new SinglePlayoutSource(picker);
}

/** A source of a single playout that always picks the minimum */
export function minPlayout(): PlayoutSource {
  return new SinglePlayoutSource(alwaysPickMin);
}

/** A source of a single playout that plays back the given picks. */
export function playback(picks: number[]): PlayoutSource {
  return new SinglePlayoutSource(new PlaybackPicker(picks));
}
