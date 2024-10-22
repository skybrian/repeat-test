import type { Range } from "./picks.ts";
import type { PickResponder } from "./build.ts";

export type Edit =
  | { type: "keep" }
  | { type: "replace"; diff: number }
  | { type: "snip" };

/**
 * Returns the edit to make at each offset in a group.
 */
export type GroupEdit = (
  offset: number,
  req: Range,
  originalReply: number,
) => Edit;

/** A group edit that keeps everything the same. */
export function keep(): Edit {
  return { type: "keep" };
}

/** A group edit that deletes everything. */
export function snip(): Edit {
  return { type: "snip" };
}

/**
 * A group edit that sets a pick to a new value.
 *
 * The argument is relative to the minimum value of the request.
 * (That is, if diff is 0, the pick is set to its minimum value.)
 */
export function replace(diff: number): Edit {
  return { type: "replace", diff };
}

/**
 * Replays the picks in a group, applying the given editor to each pick before
 * returning it.
 */
export class EditResponder implements PickResponder {
  readonly #before: readonly number[];
  readonly #edit: GroupEdit;

  #offset = 0;
  #edits = 0;
  #deletes = 0;

  constructor(
    before: readonly number[],
    edit: GroupEdit,
  ) {
    this.#before = before;
    this.#edit = edit;

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
    return this.edit(req);
  }

  get depth(): number {
    return this.#offset;
  }

  private edit(req: Range): number {
    while (true) {
      if (this.#offset >= this.#before.length) {
        return req.min;
      }
      const index = this.#offset++;
      const before = this.#before[index];
      const edit = this.#edit(index, req, before);
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

export type GroupKey = number | string;

/**
 * Returns the GroupEdit to use for each group.
 */
export type MultiEdit = (key: GroupKey) => GroupEdit;

function trimEnd(len: number): GroupEdit {
  return (offset) => offset >= len ? snip() : keep();
}

/**
 * Edits a single group by removing picks from the end.
 *
 * (This forces them to be the minimum value.)
 */
export function trimGroup(
  at: GroupKey,
  len: number,
): MultiEdit {
  return (key) => (key === at) ? trimEnd(len) : keep;
}

function snipRange(start: number, end: number): GroupEdit {
  return (offset) => offset >= start && offset < end ? snip() : keep();
}

/** Removes a range of picks in one group. */
export function removeRange(
  at: GroupKey,
  start: number,
  end: number,
): MultiEdit {
  return (key: GroupKey) => (key === at) ? snipRange(start, end) : keep;
}

function replaceAt(
  at: number,
  diff: number,
): GroupEdit {
  return (offset) => offset === at ? replace(diff) : keep();
}

/** Edits one pick in one group. */
export function replaceOnce(
  at: GroupKey,
  offset: number,
  diff: number,
): MultiEdit {
  return (key) => key === at ? replaceAt(offset, diff) : keep;
}
