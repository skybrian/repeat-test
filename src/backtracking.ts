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
export interface PlayoutPicker {
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
  startAt(depth: number): boolean;

  /**
   * Picks an integer within the range of the given request.
   *
   * If successful, the pick is recorded and the depth is incremented.
   *
   * Returns {@link Pruned} if the current playout is cancelled.
   */
  maybePick(req: PickRequest): Success<number> | Pruned;

  /**
   * Ends a playout.
   *
   * Returns either the picks for the finished playout or @{link Pruned} if the
   * search filtered it out.
   *
   * It's an error to call {@link maybePick} after finishing the playout.
   */
  finishPlayout(): boolean;

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number;

  /**
   * Returns a slice of the picks made so far.
   *
   * Available only between {@link startAt} and {@link finishPlayout}.
   */
  getPicks(start?: number, end?: number): PickList;
}

/**
 * A picker that only does one playout.
 */
export function onePlayout(picker: IntPicker): PlayoutPicker {
  let state: "ready" | "picking" | "done" = "ready";
  const picks = new PickList();

  return {
    startAt(depth: number): boolean {
      if (state !== "ready" || depth !== 0) {
        return false;
      }
      state = "picking";
      return true;
    },

    maybePick(req) {
      if (state !== "picking") {
        throw new Error(
          `maybePick called in the wrong state. Wanted "picking"; got "${state}"`,
        );
      }
      const pick = picker.pick(req);
      picks.push(req, pick);
      return success(pick);
    },

    finishPlayout(): boolean {
      if (state !== "picking") {
        throw new Error(
          `finishPlayout called in the wrong state. Wanted "picking"; got "${state}"`,
        );
      }
      state = "done";
      return true;
    },

    get depth() {
      return picks.length;
    },

    getPicks(start?: number, end?: number): PickList {
      if (state !== "picking") {
        throw new Error(
          `getPicks called in the wrong state. Wanted "picking"; got "${state}"`,
        );
      }
      return picks.slice(start, end);
    },
  };
}

/** A playout that always picks the minimum */
export function minPlayout(): PlayoutPicker {
  return onePlayout(alwaysPickMin);
}

/** A playout that plays back the given picks. */
export function playback(picks: number[]): PlayoutPicker {
  return onePlayout(new PlaybackPicker(picks));
}

/**
 * A picker that rotates each reply so that when the underlying picker picks a
 * minimum value, it picks a default value instead.
 */
export function rotatePicks(
  wrapped: PlayoutPicker,
  defaultPlayout: number[],
): PlayoutPicker {
  let picking = true; // Wrapped picker is already picking.
  const picks = new PickList();

  const picker: PlayoutPicker = {
    startAt(depth: number): boolean {
      if (depth < 0 || depth > defaultPlayout.length) {
        return false;
      }
      if (!wrapped.startAt(depth)) {
        return false;
      }
      picks.length = depth;
      picking = true;
      return true;
    },

    maybePick(req) {
      const depth = wrapped.depth;
      const oldPick = wrapped.maybePick(req);
      if (!oldPick.ok) return oldPick;

      if (depth >= defaultPlayout.length) {
        picks.push(req, oldPick.val);
        return oldPick;
      }

      const def = defaultPlayout[depth];
      let pick = oldPick.val - req.min + def;
      while (pick > req.max) {
        pick -= req.size;
      }
      picks.push(req, pick);
      return success(pick);
    },

    finishPlayout(): boolean {
      picking = false;
      return wrapped.finishPlayout();
    },

    get depth() {
      return picks.length;
    },

    getPicks(start?: number, end?: number): PickList {
      if (!picking) {
        throw new Error("getPicks called in the wrong state");
      }
      return picks.slice(start, end);
    },
  };
  return picker;
}
