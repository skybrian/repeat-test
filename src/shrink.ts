import { PickRequest } from "./picks.ts";
import { Playout } from "./playouts.ts";

/** Returns a list of guesses that are smaller than the given reply. */
export function pickGuesses(
  req: PickRequest,
  reply: number,
): Iterable<number> {
  if (reply === req.min) {
    return [];
  }
  return [req.min];
}

export function* removeTrailingGuesses(
  playout: Playout,
): Iterable<number[]> {
  const picks = playout.picks.trim();
  if (picks.length === 0) {
    return; // Already at the minimum.
  }

  // Try trimming the last half of the picks.
  if (picks.length > 1) {
    let newLen = Math.ceil(picks.length / 2);
    while (newLen < picks.length) {
      yield picks.replies.slice(0, newLen);
      const remaining = picks.length - newLen;
      newLen += Math.ceil(remaining / 2);
    }
  }
}
