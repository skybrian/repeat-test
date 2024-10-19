import type { Range } from "./picks.ts";
import type { PickResponder } from "./build.ts";

import { assert } from "@std/assert";

export type Edit =
  | { type: "keep" }
  | { type: "replace"; diff: number }
  | { type: "snip" };

/**
 * Given a pick request and reply from a stream, returns the reply to use in
 * the new stream.
 */
export type StreamEditor = (
  pickIndex: number,
  before: number,
  req: Range,
) => Edit;

/** An editor that keeps each pick. */
export function keep(): Edit {
  return { type: "keep" };
}

/** An editor that deletes each pick. */
export function snip(): Edit {
  return { type: "snip" };
}

/**
 * Makes an edit that changes each pick to a value relative to its minimum.
 * (That is, if diff is 0, the pick is set to its minimum value.)
 */
export function replace(diff: number): Edit {
  return { type: "replace", diff };
}

/**
 * Replays a stream of picks, applying the given editor to each pick.
 */
export class PickEditor implements PickResponder {
  private offset = 0;

  #edits = 0;
  #deletes = 0;

  constructor(
    private readonly before: readonly number[],
    private readonly editor: StreamEditor,
  ) {
    assert(this.depth === 0);

    for (let i = 0; i < before.length; i++) {
      if (!Number.isSafeInteger(before[i])) {
        throw new Error(`${i}: expected a safe integer, got: ${before[i]}`);
      } else if (before[i] < 0) {
        throw new Error(
          `${i}: expected a non-negative integer, got: ${before[i]}`,
        );
      }
    }
  }

  startAt(depth: number): boolean {
    return depth === this.depth;
  }

  nextPick(req: Range): number {
    const pick = this.edit(req);
    return pick;
  }

  get depth(): number {
    return this.offset;
  }

  private edit(req: Range): number {
    while (true) {
      if (this.offset >= this.before.length) {
        return req.min;
      }
      const index = this.offset++;
      const before = this.before[index];
      const edit = this.editor(index, before, req);
      let val = before;
      switch (edit.type) {
        case "keep":
          break;
        case "replace":
          val = req.min + edit.diff;
          break;
        case "snip":
          this.#deletes++;
          continue;
      }
      if (val < req.min || val > req.max) {
        val = req.min;
      }
      if (val != before) {
        this.#edits++;
      }
      return val;
    }
  }

  get edited(): boolean {
    return this.#edits > 0 || this.#deletes > 0;
  }

  get edits(): number {
    return this.#edits;
  }

  get deletes(): number {
    return this.#deletes;
  }
}

export type StepKey = number | string;

/**
 * Edits a stream of picks that's split into steps.
 */
export type StepEditor = (key: StepKey) => StreamEditor;

function trimEnd(len: number): StreamEditor {
  return (offset) => offset >= len ? snip() : keep();
}

/**
 * Edits a step's picks by removing picks from the end.
 *
 * (This forces them to be the minimum value.)
 */
export function trimStep(
  stepKey: StepKey,
  len: number,
): StepEditor {
  return (key) => (key === stepKey) ? trimEnd(len) : keep;
}

function snipRange(start: number, end: number): StreamEditor {
  return (offset) => offset >= start && offset < end ? snip() : keep();
}

/** Removes a range of picks in one step. */
export function removeRange(
  stepKey: StepKey,
  start: number,
  end: number,
): StepEditor {
  return (key: StepKey) => (key === stepKey) ? snipRange(start, end) : keep;
}

function replaceAt(
  at: number,
  diff: number,
): StreamEditor {
  return (offset) => offset === at ? replace(diff) : keep();
}

export function replaceOnce(
  stepKey: StepKey,
  at: number,
  diff: number,
): StepEditor {
  return (key) => key === stepKey ? replaceAt(at, diff) : keep;
}
