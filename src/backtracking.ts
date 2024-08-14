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
  abstract startAt(depth: number): boolean;

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
  abstract endPlayout(): boolean;

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number {
    return this.reqs.length;
  }

  protected abstract getReplies(start?: number, end?: number): number[];

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

    return new PickList(
      this.reqs.slice(start, end),
      this.getReplies(start, end),
    );
  }
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

  endPlayout(): boolean {
    if (this.state !== "picking") {
      throw new Error(
        `finishPlayout called in the wrong state. Wanted "picking"; got "${this.state}"`,
      );
    }
    this.state = "searchDone";
    return true;
  }

  protected getReplies(start?: number, end?: number): number[] {
    return this.replies.slice(start, end);
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
