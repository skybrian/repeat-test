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
  const { reqs, picks } = playout;

  while (
    picks.length > 0 && picks[picks.length - 1] === reqs[reqs.length - 1].min
  ) {
    picks.pop();
    reqs.pop();
  }

  // Try trimming the last half of the picks.
  if (reqs.length > 1) {
    let newLen = Math.floor(picks.length / 2);
    while (newLen < reqs.length) {
      yield picks.slice(0, newLen);
      const remaining = picks.length - newLen;
      newLen += Math.ceil(remaining / 2);
    }
  }
}
