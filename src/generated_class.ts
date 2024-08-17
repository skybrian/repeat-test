import { type PlayoutSource, Pruned } from "./backtracking.ts";
import {
  type GenerateOpts,
  makePickFunction,
  type PickSet,
} from "./generate.ts";
import type { PickRequest } from "./picks.ts";

/**
 * A generated value and the picks that were used to generate it.
 */
export type Generated<T> = {
  ok: true;
  reqs: PickRequest[];
  replies: number[];
  val: T;
};

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
        return { ok: true, reqs, replies, val };
      }
    } catch (e) {
      if (!(e instanceof Pruned)) {
        throw e;
      }
    }
  }
}
