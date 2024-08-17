import { type PlayoutSource, Pruned } from "./backtracking.ts";
import {
  type GenerateOpts,
  makePickFunction,
  type PickSet,
} from "./pick_function.ts";
import type { PickRequest } from "./picks.ts";

/**
 * Holds a generated value along with the picks that were used to generate it.
 */
export class Generated<T> {
  #reqs: PickRequest[];
  #replies: number[];
  #val: T;

  constructor(
    reqs: PickRequest[],
    replies: number[],
    val: T,
  ) {
    this.#reqs = reqs;
    this.#replies = replies;
    this.#val = val;
  }

  readonly ok = true;

  get val(): T {
    return this.#val;
  }

  requests(): PickRequest[] {
    return this.#reqs.slice();
  }

  replies(): number[] {
    return this.#replies.slice();
  }
}

/**
 * Generates a value by trying each playout one at a time, given a source of
 * playouts.
 *
 * Returns undefined if it ran out of playouts without generating anything.
 */
export function generate<T>(
  set: PickSet<T>,
  playouts: PlayoutSource,
  opts?: GenerateOpts,
): Generated<T> | undefined {
  while (playouts.startAt(0)) {
    try {
      const pick = makePickFunction(playouts, opts);
      const val = set.generateFrom(pick);
      const reqs = playouts.getRequests();
      const replies = playouts.getReplies();
      if (playouts.endPlayout()) {
        return new Generated(reqs, replies, val);
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  }
}
