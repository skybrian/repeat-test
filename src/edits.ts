import type { IntPicker, PickRequest } from "./picks.ts";

export type Edit =
  | { type: "keep" }
  | { type: "replace"; val: number }
  | { type: "snip" };

export function keep(): Edit {
  return { type: "keep" };
}

export function replace(val: number): Edit {
  return { type: "replace", val };
}

export function snip(): Edit {
  return { type: "snip" };
}

/**
 * Edits a stream of integers.
 */
export interface StreamEditor {
  /**
   * Given a pick request and reply from a stream, returns the reply to use in
   * the new stream.
   *
   * Returning `undefined` means that the previous reply should be skipped
   * (deleted). The next call to `replace` will use the same request and the
   * next reply.
   */
  visit(req: PickRequest, before: number): Edit;
}

/** An editor that doesn't change the stream. */
export const noChange: StreamEditor = {
  visit: keep,
};

/**
 * Edits a playout by removing picks from the end (forcing them to be the minimum).
 */
export function trimEnd(len: number): StreamEditor {
  let reqs = 0;
  return {
    visit(): Edit {
      if (reqs >= len) {
        return snip();
      }
      reqs++;
      return keep();
    },
  };
}

export function deleteRange(start: number, end: number): StreamEditor {
  let reqs = 0;
  return {
    visit(): Edit {
      if (reqs < start || reqs >= end) {
        reqs++;
        return keep();
      }
      reqs++;
      return snip();
    },
  };
}

export function replaceAt(
  index: number,
  replacement: number,
): StreamEditor {
  let reqs = 0;
  return {
    visit(): Edit {
      if (reqs === index) {
        reqs++;
        return replace(replacement);
      }
      reqs++;
      return keep();
    },
  };
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
      const before = this.before[this.index++];
      const edit = this.editor.visit(req, before);
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
