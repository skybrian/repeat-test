import { alwaysPickDefault, IntPicker, PickRequest } from "./picks.ts";

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

/** An iterable that provides one playout that always picks the default. */
export function defaultPlayout(): Iterable<RetryPicker> {
  return onePlayout(alwaysPickDefault);
}

/**
 * A picker that overrides some requests' default values before passing them on.
 *
 * Each request will be modified until the underlying picker chooses a
 * non-default value.
 */
export function replaceDefaults(
  wrapped: RetryPicker,
  defaultPlayout: number[],
): RetryPicker {
  let onDefaultPath = true;

  const picker: RetryPicker = {
    maybePick(req) {
      const depth = wrapped.depth;
      if (!onDefaultPath || depth >= defaultPlayout.length) {
        onDefaultPath = false;
        return wrapped.maybePick(req);
      }
      const modified = req.withDefault(defaultPlayout[depth]);
      const pick = wrapped.maybePick(modified);
      if (pick !== modified.default) {
        onDefaultPath = false;
      }
      return pick;
    },
    backTo: function (depth: number): boolean {
      if (!wrapped.backTo(depth)) {
        return false;
      }
      if (onDefaultPath) {
        return true; // Unchanged by backtracking.
      }
      depth = wrapped.depth;
      if (depth >= defaultPlayout.length) {
        return true;
      }
      // Check that the picks so far match the new defaults.
      const picks = wrapped.getPicks();
      for (let i = 0; i < depth; i++) {
        if (picks[i] !== defaultPlayout[i]) {
          return true;
        }
      }
      onDefaultPath = true;
      return true;
    },
    finishPlayout: function (): boolean {
      return wrapped.finishPlayout();
    },

    get depth() {
      return wrapped.depth;
    },
    getPicks: function (): number[] {
      return wrapped.getPicks();
    },
  };
  return picker;
}