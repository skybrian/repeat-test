import type { IntPicker, PickRequest } from "./picks.ts";

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
  replace(req: PickRequest, before: number): number | undefined;
}

/** An editor that doesn't change the stream. */
export const noChange: StreamEditor = {
  replace(_, before) {
    return before;
  },
};

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
      let edit = this.editor.replace(req, before);
      if (edit !== undefined) {
        if (!req.inRange(edit)) {
          edit = req.min;
        }
        if (edit !== before) {
          this.#edits++;
        }
        return edit;
      }
      this.#deletes++;
    }
  }

  get edits(): number {
    return this.#edits;
  }

  get deletes(): number {
    return this.#deletes;
  }
}
