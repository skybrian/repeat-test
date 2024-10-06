import type { IntPicker, PickRequest } from "./picks.ts";

export type Edit =
  | { type: "keep" }
  | { type: "replace"; val: number }
  | { type: "snip" };

/**
 * Given a pick request and reply from a stream, returns the reply to use in
 * the new stream.
 */
export type StreamEditor = (
  pickIndex: number,
  before: number,
  req: PickRequest,
) => Edit;

/** An editor that keeps each pick. */
export function keep(): Edit {
  return { type: "keep" };
}

/** An editor that deletes each pick. */
export function snip(): Edit {
  return { type: "snip" };
}

/** Makes an edit that unconditionally replaces a pick. */
export function replace(val: number): Edit {
  return { type: "replace", val };
}

/**
 * A picker that replays an array of integers with edits.
 */
export class EditPicker implements IntPicker {
  private index = 0;
  #edits = 0;
  #deletes = 0;

  constructor(
    private readonly before: number[],
    private readonly editor: StreamEditor,
  ) {
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

  pick(req: PickRequest): number {
    while (true) {
      if (this.index >= this.before.length) {
        return req.min;
      }
      const index = this.index++;
      const before = this.before[index];
      const edit = this.editor(index, before, req);
      let val = before;
      switch (edit.type) {
        case "keep":
          break;
        case "replace": {
          val = edit.val;
          break;
        }
        case "snip":
          this.#deletes++;
          continue;
      }
      if (!req.inRange(val)) {
        val = req.min;
      }
      if (val != before) {
        this.#edits++;
      }
      return val;
    }
  }

  get edits(): number {
    return this.#edits;
  }

  get deletes(): number {
    return this.#deletes;
  }
}

/**
 * Edits a stream of picks that's split into segments.
 */
export type SegmentEditor = (segmentIndex: number) => StreamEditor;

function trimEdit(len: number): StreamEditor {
  return (index) => index >= len ? snip() : keep();
}

/**
 * Edits a segment by removing picks from the end (forcing them to be the minimum).
 */
export function trimSegment(
  segment: number,
  offset: number,
): SegmentEditor {
  return (seg) => (seg === segment) ? trimEdit(offset) : keep;
}

function snipRangeEdit(start: number, end: number): StreamEditor {
  return (index) => index >= start && index < end ? snip() : keep();
}

export function snipRange(
  segment: number,
  start: number,
  end: number,
): SegmentEditor {
  return (seg: number) => (seg === segment) ? snipRangeEdit(start, end) : keep;
}

function replaceEdit(
  at: number,
  replacement: number,
): StreamEditor {
  return (index) => index === at ? replace(replacement) : keep();
}

export function replaceAt(
  segment: number,
  offset: number,
  val: number,
): SegmentEditor {
  return (seg) => seg === segment ? replaceEdit(offset, val) : keep;
}
