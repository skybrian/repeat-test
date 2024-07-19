import { PickRequest, PlaybackPicker } from "./picks.ts";
import { onePlayout } from "./backtracking.ts";
import { Playout } from "./playouts.ts";
import Arbitrary, { Solution } from "./arbitrary_class.ts";

/**
 * Given a playout from an arbitrary, returns a smaller solution that satisfies a predicate.
 */
export function shrink<T>(
  arb: Arbitrary<T>,
  sol: Solution<T>,
  interesting: (arg: T) => boolean,
): Solution<T> {
  while (true) {
    const next = shrinkOnce(arb, guesses(sol.playout), interesting);
    if (!next) {
      return sol;
    }
    sol = next;
  }
}

export function shrinkOnce<T>(
  arb: Arbitrary<T>,
  guesses: Iterable<number[]>,
  interesting: (arg: T) => boolean,
): Solution<T> | undefined {
  for (const guess of guesses) {
    const picker = new PlaybackPicker(guess);
    const input = arb.pickSolution(onePlayout(picker));
    if (input && interesting(input.val)) {
      return input;
    }
  }
  return undefined;
}

function* guesses(
  playout: Playout,
): Iterable<number[]> {
  const shorter = shorterGuesses(playout)[Symbol.iterator]();
  const smaller = changePickGuesses(playout)[Symbol.iterator]();
  while (true) {
    const next1 = shorter.next();
    const next2 = smaller.next();
    if (next1.done && next2.done) {
      return;
    }
    if (!next1.done) {
      yield next1.value;
    }
    if (!next2.done) {
      yield next2.value;
    }
  }
}

/** Tries removing suffixes of the given playout. */
export function* shorterGuesses(
  playout: Playout,
): Iterable<number[]> {
  const picks = playout.picks.trim();
  if (picks.length === 0) {
    return; // Already at the minimum.
  }

  // Try trimming the last half of the picks.
  if (picks.length > 0) {
    let newLen = Math.floor(picks.length / 2);
    while (newLen < picks.length) {
      yield picks.replies.slice(0, newLen);
      const remaining = picks.length - newLen;
      newLen += Math.ceil(remaining / 2);
    }
  }
}

/** Tries changing one pick at a time. */
export function* changePickGuesses(
  playout: Playout,
): Iterable<number[]> {
  const picks = playout.picks.trim();
  const { reqs, replies } = playout.picks;
  for (let i = 0; i < picks.length; i++) {
    for (const guess of pickGuesses(reqs[i], replies[i])) {
      yield [...replies.slice(0, i), guess, ...replies.slice(i + 1)];
    }
  }
}

/** Returns a list of guesses that are smaller than the given reply. */
export function* pickGuesses(
  req: PickRequest,
  reply: number,
): Iterable<number> {
  let min = req.min;
  while (min < reply) {
    const guess = Math.floor((min + reply) / 2);
    yield guess;
    min = guess + 1;
  }
}
