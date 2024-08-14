import { assert } from "@std/assert";
import { Success, success } from "./results.ts";
import {
  alwaysPickMin,
  IntPicker,
  PickList,
  PickRequest,
  PlaybackPicker,
} from "./picks.ts";

/**
 * Indicates that a sequence of picks didn't result in generating a value.
 *
 * This can happen due to filtering or a partial search.
 *
 * Sometimes recovery is possible by starting a new playout and picking again.
 * (See {@link PlayoutPicker.startAt}.) It won't be possible when a search has
 * visited every playout.
 */
export class Pruned extends Error {
  readonly ok = false;
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * A picker that can back up to a previous point in a pick sequence and try a
 * different path.
 */
export abstract class PlayoutPicker {
  protected state: "ready" | "picking" | "playoutDone" | "searchDone" = "ready";
  protected reqs: PickRequest[] = [];

  /** Returns true if a playout is in progress. */
  get picking() {
    return this.state === "picking";
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
    this.trim(depth);
    this.reqs.length = depth;
    this.state = "picking";
    return true;
  }
  /**
   * Picks an integer within the range of the given request.
   *
   * If successful, the pick is recorded and the depth is incremented.
   *
   * Returns {@link Pruned} if the current playout is cancelled.
   */
  abstract maybePick(req: PickRequest): Success<number> | Pruned;

  /**
   * Ends a playout.
   *
   * Returns either the picks for the finished playout or @{link Pruned} if the
   * search filtered it out.
   *
   * It's an error to call {@link maybePick} after finishing the playout.
   */
  endPlayout(): boolean {
    assert(this.state === "picking", "endPlayout called in the wrong state");
    const accepted = this.acceptPlayout();
    this.removePlayout();
    return accepted;
  }

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number {
    return this.reqs.length;
  }

  /**
   * Returns a slice of the picks made so far.
   *
   * Available only between {@link startAt} and {@link endPlayout}.
   */
  getPicks(start?: number, end?: number): PickList {
    if (this.state !== "picking") {
      throw new Error(
        `getPicks called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    start = start ?? 0;
    assert(start >= 0);
    end = end ?? this.depth;
    assert(end >= start);

    return PickList.zip(
      this.reqs.slice(start, end),
      this.getReplies(start, end),
    );
  }

  protected abstract getReplies(start?: number, end?: number): number[];

  /** Returns true if the current playout is not filtered out. */
  protected acceptPlayout(): boolean {
    return true;
  }

  /**
   * Removes the current playout, setting the state to 'playoutDone' or 'searchDone'.
   */
  protected abstract removePlayout(): void;

  protected abstract trim(depth: number): void;
}

/**
 * A picker that only does one playout.
 */
class SinglePlayoutPicker extends PlayoutPicker {
  private replies: number[] = [];

  constructor(private picker: IntPicker) {
    super();
  }

  startAt(depth: number): boolean {
    if (this.state !== "ready" || depth !== 0) {
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
    const pick = this.picker.pick(req);
    this.reqs.push(req);
    this.replies.push(pick);
    return success(pick);
  }

  protected removePlayout(): void {
    this.state = "searchDone";
  }

  protected getReplies(start?: number, end?: number): number[] {
    return this.replies.slice(start, end);
  }

  protected trim(_depth: number): void {
    assert(false);
  }
}

/**
 * A picker that only does one playout.
 */
export function onePlayout(picker: IntPicker): PlayoutPicker {
  return new SinglePlayoutPicker(picker);
}

/** A playout that always picks the minimum */
export function minPlayout(): PlayoutPicker {
  return new SinglePlayoutPicker(alwaysPickMin);
}

/** A playout that plays back the given picks. */
export function playback(picks: number[]): PlayoutPicker {
  return new SinglePlayoutPicker(new PlaybackPicker(picks));
}
