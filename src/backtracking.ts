import { alwaysPickMin, IntPicker, PickRequest } from "./picks.ts";

/**
 * This playout was cancelled, perhaps because it was filtered out.
 *
 * Typically, the exception will be caught somewhere and then
 * {@link RetryPicker.backTo} can be called to try again with the next playout.
 */
export class PlayoutPruned extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/**
 * A picker that can back up to a previous point in a pick sequence and try a
 * different path.
 */
export interface RetryPicker {
  /**
   * Picks an integer within the range of the given request.
   *
   * If successful, the pick is recorded and the depth is incremented.
   *
   * Throws {@link PlayoutPruned} if the current playout is cancelled.
   */
  maybePick(req: PickRequest): number;

  /**
   * Tells the picker that no more picks are needed.
   *
   * Returns false if the current playout is cancelled.
   * It's an error to call {@link maybePick} after finishing the playout.
   */
  finishPlayout(): boolean;

  /**
   * Returns to a previous point in the pick sequence.
   *
   * This implicitly cancels the current playout and starts a new playout.
   *
   * If it fails, there's no next playout at the given depth, and the caller
   * should try again with a lower depth.
   *
   * If `backTo(0)` returns false, the entire tree has been searched.
   */
  backTo(depth: number): boolean;

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number;

  /**
   * Returns the picks made so far.
   */
  getPicks(): number[];
}

/**
 * Converts an IntPicker to a RetryPicker, without support for backtracking.
 *
 * It just logs the picks.
 */
export function onePlayoutPicker(picker: IntPicker): RetryPicker {
  const picks: number[] = [];
  let done = false;

  return {
    get depth() {
      return picks.length;
    },

    maybePick(req) {
      if (done) {
        throw new Error("maybePick called after the playout finished");
      }
      const pick = picker.pick(req);
      picks.push(pick);
      return pick;
    },
    finishPlayout: function (): boolean {
      done = true;
      return true;
    },
    backTo: function (): boolean {
      return false;
    },

    getPicks: function (): number[] {
      return picks.slice();
    },
  };
}

export function onePlayout(picker: IntPicker): Iterable<RetryPicker> {
  return [onePlayoutPicker(picker)].values();
}

/** An iterable that provides one playout that always picks the minimum. */
export function minPlayout(): Iterable<RetryPicker> {
  return onePlayout(alwaysPickMin);
}

/**
 * A picker that rotates each reply so that when the underlying picker picks a
 * minimum value, it picks a default value instead.
 */
export function rotatePicks(
  wrapped: RetryPicker,
  defaultPlayout: number[],
): RetryPicker {
  const picks: number[] = [];

  const picker: RetryPicker = {
    maybePick(req) {
      const depth = wrapped.depth;
      const oldPick = wrapped.maybePick(req);
      if (depth >= defaultPlayout.length) {
        picks.push(oldPick);
        return oldPick;
      }

      const def = defaultPlayout[depth];
      let pick = oldPick - req.min + def;
      while (pick > req.max) {
        pick -= req.size;
      }
      picks.push(pick);
      return pick;
    },
    backTo(depth: number): boolean {
      if (!wrapped.backTo(depth)) {
        return false;
      }
      picks.length = depth;
      return true;
    },
    finishPlayout: function (): boolean {
      return wrapped.finishPlayout();
    },

    get depth() {
      return wrapped.depth;
    },
    getPicks: function (): number[] {
      return picks;
    },
  };
  return picker;
}
