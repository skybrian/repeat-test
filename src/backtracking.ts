import { alwaysPickDefault, IntPicker, PickRequest } from "./picks.ts";

/**
 * A picker that can back up to a previous point in a pick sequence and try a
 * different path.
 */
export interface RetryPicker {
  /**
   * Returns a pick based on the given request.
   *
   * The pick is recorded and depth is incremented.
   */
  pick(req: PickRequest): number;

  /**
   * The number of picks so far. (Corresponds to the current depth in a search
   * tree.)
   */
  get depth(): number;

  /**
   * Returns to a previous point in the pick sequence.
   *
   * This implicitly finishes the current playout and starts a new playout.
   *
   * If it fails, there's no next playout at the given depth, and the caller
   * should try again with a lower depth.
   *
   * If `backTo(0)` returns false, the entire tree has been searched.
   */
  backTo(depth: number): boolean;

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

  return {
    get depth() {
      return picks.length;
    },

    pick(req) {
      const pick = picker.pick(req);
      picks.push(pick);
      return pick;
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
    get depth() {
      return wrapped.depth;
    },

    pick(req) {
      const depth = wrapped.depth;
      if (!onDefaultPath || depth >= defaultPlayout.length) {
        onDefaultPath = false;
        return wrapped.pick(req);
      }
      const modified = req.withDefault(defaultPlayout[depth]);
      const pick = wrapped.pick(modified);
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

    getPicks: function (): number[] {
      return wrapped.getPicks();
    },
  };
  return picker;
}
